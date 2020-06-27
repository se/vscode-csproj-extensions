// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { subscribeToDocumentChanges, EMOJI_MENTION } from "./diagnostics";
import slugify from "slugify";
import { v4 as uuidv4 } from "uuid";
import * as parser from "fast-xml-parser";

const MarketplaceCommand = "csproj-extensions.command.MARKETPLACE";

function getParameters(content: String) {
  const parameters = [];
  const regexRoot = /<PropertyGroup>(.+?)<\/PropertyGroup>/gm;
  const contentString = content.replace(/\n/gm, "").toString();

  let m;
  while ((m = regexRoot.exec(contentString)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regexRoot.lastIndex) {
      regexRoot.lastIndex++;
    }

    const parametersContent = m[1];

    const regexParameter = /<(.+?)>(.+?)<\/(.+?)>/gm;

    let mp;

    while ((mp = regexParameter.exec(parametersContent)) !== null) {
      // This is necessary to avoid infinite loops with zero-width matches
      if (mp.index === regexParameter.lastIndex) {
        regexParameter.lastIndex++;
      }

      parameters.push({
        name: mp[1],
        value: mp[2],
      });
    }

    return parameters;
  }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log('"csproj-extensions" is activated and up and running!');

  const xmlCompletion = vscode.languages.registerCompletionItemProvider("xml", {
    provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      token: vscode.CancellationToken,
      context: vscode.CompletionContext
    ) {
      // if (position.character < 1 || position.line < 0) {
      //   return [];
      // }
      // const beforeChar = document.lineAt(position.line).text[
      //   position.character - 1
      // ];
      // if (beforeChar !== "$") {
      //   return [];
      // }

      const importRegex = /\<Import Project="(.+?)" \/>/gm;

      let m;

      const documentText = document.getText();

      while ((m = importRegex.exec(documentText)) !== null) {
        // This is importRegex to avoid infinite loops with zero-width matches
        if (m.index === importRegex.lastIndex) {
          importRegex.lastIndex++;
        }

        const importFileName = m[1];
        if (!importFileName) {
          continue;
        }

        const documentFilePath = path.parse(document.fileName).dir;
        const importFilePath = path.join(documentFilePath, importFileName);
        try {
          const file = fs.readFileSync(importFilePath, "utf-8");
          const parameters = getParameters(file);
          console.debug(parameters);

          const completions: vscode.ProviderResult<
            | vscode.CompletionItem[]
            | vscode.CompletionList<vscode.CompletionItem>
          > = [];
          parameters?.forEach((parameter) => {
            const parameterCompletion = new vscode.CompletionItem(
              parameter.name
            );
            parameterCompletion.commitCharacters = ["$"];
            parameterCompletion.insertText = new vscode.SnippetString(
              `$(${parameter.name})`
            );

            parameterCompletion.documentation = new vscode.MarkdownString(
              `*${parameter.name}* refers a value as **${parameter.value}**.`
            );

            completions.push(parameterCompletion);
          });

          return completions;
        } catch (error) {
          console.error(error);
        }
      }
      return [];
    },
  });

  context.subscriptions.push(xmlCompletion);

  // let disposable = vscode.commands.registerCommand(
  //   "csproj-extensions.toggleExtensionState",
  //   () => {
  //     // The code you place here will be executed every time your command is executed
  //     // Display a message box to the user
  //     vscode.window.showInformationMessage("Activated!");
  //   }
  // );

  // context.subscriptions.push(disposable);

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      "xml",
      new ValueExtractorProvider(),
      {
        providedCodeActionKinds: ValueExtractorProvider.providedCodeActionKinds,
      }
    )
  );

  // const emojiDiagnostics = vscode.languages.createDiagnosticCollection("emoji");
  // context.subscriptions.push(emojiDiagnostics);

  // subscribeToDocumentChanges(context, emojiDiagnostics);

  // context.subscriptions.push(
  //   vscode.languages.registerCodeActionsProvider("xml", new Emojinfo(), {
  //     providedCodeActionKinds: Emojinfo.providedCodeActionKinds,
  //   })
  // );

  context.subscriptions.push(
    vscode.commands.registerCommand(MarketplaceCommand, (data) => {
      console.debug(data);
      vscode.env.openExternal(
        vscode.Uri.parse(
          "https://marketplace.visualstudio.com/items?itemName=selcukermaya.se-csproj-extensions"
        )
      );
    })
  );
}

/**
 * Provides code actions for converting :) to a smiley emoji.
 */
export class ValueExtractorProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] | undefined {
    const xmlTag = this.getXmlTag(document, range);
    const xmlAttributesTag = this.getXmlAttributeTag(document, range);
    if (!xmlTag && !xmlAttributesTag) {
      return;
    }

    const actions = [];

    if (xmlTag) {
      const replaceXmlTag = this.createFix(document, range, xmlTag);
      actions.push(replaceXmlTag);
    }

    if (xmlAttributesTag && xmlAttributesTag.length) {
      xmlAttributesTag.forEach((attr) => {
        const replaceXmlTag = this.createFix(document, range, attr);
        replaceXmlTag.isPreferred = attr.prefer;
        actions.push(replaceXmlTag);
      });
    }

    const commandAction = this.createCommand();
    actions.push(commandAction);
    return actions;
  }

  private getXmlAttributeTag(
    document: vscode.TextDocument,
    range: vscode.Range
  ) {
    const attributes: {
      id: string;
      name: string;
      value: string;
      start: number;
      end: number;
      replacement: string;
      property: string;
      prefer: boolean;
    }[] = [];

    const rex = /(\S+)=["]?((?:.(?!["]?\s+(?:\S+)=|[>"]))+.)["]?/g;

    const start = range.start;
    const line = document.lineAt(start.line);

    let m;

    const id = uuidv4();

    while ((m = rex.exec(line.text)) !== null) {
      if (m.index === rex.lastIndex) {
        rex.lastIndex++;
      }

      const attribute = m[1];
      const value = m[2];

      if (!attribute || !value) {
        return null;
      }

      const tagName = `${attribute}`;
      const valueStartIndex = line.text.indexOf(tagName) + tagName.length + 2;
      const valueEndIndex = valueStartIndex + value.length;
      attributes.push({
        id: id,
        name: attribute,
        value: value,
        start: valueStartIndex,
        end: valueEndIndex,
        replacement: "",
        property: "",
        prefer: false,
      });
    }

    attributes.forEach((attr) => {
      if (attr.name === "Include") {
        return;
      }

      const includeAttr = attributes.find(
        (x) => x.id === attr.id && x.name === "Include"
      );
      if (!includeAttr) {
        return;
      }
      const slug = slugify(includeAttr.value, { remove: /\./g });
      attr.property = `${slug}Version`;
      attr.replacement = `$(${attr.property})`;
      attr.prefer = true;
    });

    return attributes;
  }

  private getXmlTag(document: vscode.TextDocument, range: vscode.Range) {
    const rex = /\<(.+?)\>(.+?)\<\/(.+?)\>/g;

    const start = range.start;
    const line = document.lineAt(start.line);

    const m = rex.exec(line.text);
    if (!m) {
      return null;
    }

    if (m.length < 4) {
      return null;
    }

    const tag = m[1];
    const value = m[2];

    if (!tag || !value) {
      return null;
    }

    const tagName = `<${tag}>`;
    const valueStartIndex = line.text.indexOf(tagName) + tagName.length;
    const valueEndIndex = valueStartIndex + value.length;
    const property = tag;
    return {
      tag: tag,
      value: value,
      start: valueStartIndex,
      end: valueEndIndex,
      replacement: `$(${property})`,
      property: property,
      prefer: false,
    };
  }

  private createFix(
    document: vscode.TextDocument,
    range: vscode.Range,
    tag: any
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      `Extract ${tag.name} [${tag.value}] to props file`,
      vscode.CodeActionKind.QuickFix
    );
    const posStart = new vscode.Position(range.start.line, tag.start);
    const posEnd = new vscode.Position(range.start.line, tag.end);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(
      document.uri,
      new vscode.Range(posStart, posEnd),
      tag.replacement
    );

    action.command = {
      command: MarketplaceCommand,
      title: "Learn more about this extension",
      tooltip: "This will open extensions market place page.",
    };

    return action;
  }

  private createCommand(): vscode.CodeAction {
    const action = new vscode.CodeAction(
      "Learn more...",
      vscode.CodeActionKind.Empty
    );
    action.command = {
      command: MarketplaceCommand,
      title: "Learn more about this extension",
      tooltip: "This will open extensions market place page.",
    };
    return action;
  }
}

/**
 * Provides code actions corresponding to diagnostic problems.
 */
export class Emojinfo implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    // for each diagnostic entry that has the matching `code`, create a code action command
    return context.diagnostics
      .filter((diagnostic) => diagnostic.code === EMOJI_MENTION)
      .map((diagnostic) => this.createCommandCodeAction(diagnostic));
  }

  private createCommandCodeAction(
    diagnostic: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      "Learn more...",
      vscode.CodeActionKind.QuickFix
    );
    action.command = {
      command: MarketplaceCommand,
      title: "Learn more about emojis",
      tooltip: "This will open the unicode emoji page.",
    };
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
