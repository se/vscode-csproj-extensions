// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import slugify from "slugify";
import { v4 as uuidv4 } from "uuid";
import * as parser from "fast-xml-parser";
import { j2xParser as JsonToXml } from "fast-xml-parser";

const COMMAND_MARKETPLACE = "csproj-extensions.command.MARKETPLACE";
const COMMAND_APPENDPROPSFILE = "csproj-extensions.command.APPENDPROPSFILE";

function getParameters(filePath: string) {
  const parameters = [];
  try {
    const content = fs.readFileSync(filePath, "utf-8").toString();

    const regexRoot = /<PropertyGroup>(.+?)<\/PropertyGroup>/gm;
    const contentString = content.replace(/\n/gm, "").toString();

    let m;
    while ((m = regexRoot.exec(contentString)) !== null) {
      if (m.index === regexRoot.lastIndex) {
        regexRoot.lastIndex++;
      }

      const parametersContent = m[1];

      const regexParameter = /<(.+?)>(.+?)<\/(.+?)>/gm;

      let mp;

      while ((mp = regexParameter.exec(parametersContent)) !== null) {
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
  } catch (error) {
    console.error(error);
  }
  return parameters;
}

function GetPropsFiles(document: vscode.TextDocument) {
  const files = [];
  const importRegex = /\<Import Project="(.+?)" \/>/gm;
  const content = document.getText();
  const documentFilePath = path.parse(document.fileName).dir;

  let m;
  while ((m = importRegex.exec(content)) !== null) {
    if (m.index === importRegex.lastIndex) {
      importRegex.lastIndex++;
    }

    const importFileName = m[1];
    if (!importFileName) {
      continue;
    }

    files.push(path.join(documentFilePath, importFileName));
  }

  return files;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('"csproj-extensions" is activated and up and running!');

  const xmlCompletion = vscode.languages.registerCompletionItemProvider("xml", {
    provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      token: vscode.CancellationToken,
      context: vscode.CompletionContext
    ) {
      const files = GetPropsFiles(document);

      files.forEach((filePath) => {
        try {
          const parameters = getParameters(filePath);
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
      });
      return [];
    },
  });

  context.subscriptions.push(xmlCompletion);

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      "xml",
      new ValueExtractorProvider(),
      {
        providedCodeActionKinds: ValueExtractorProvider.providedCodeActionKinds,
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_MARKETPLACE, () =>
      vscode.env.openExternal(
        vscode.Uri.parse(
          "https://marketplace.visualstudio.com/items?itemName=selcukermaya.se-csproj-extensions"
        )
      )
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMAND_APPENDPROPSFILE,
      async (tag: any, document: vscode.TextDocument, range: vscode.Range) => {
        if (!tag) {
          return;
        }

        if (!tag.replacement) {
          const inputValue = await vscode.window.showInputBox({});
          if (!`${inputValue}`.trim()) {
            return;
          }
          tag.replacement = `$(${inputValue})`;
        }

        const posStart = new vscode.Position(range.start.line, tag.start);
        const posEnd = new vscode.Position(range.start.line, tag.end);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(posStart, posEnd),
          tag.replacement
        );
        vscode.workspace.applyEdit(edit);

        const filePath = `${GetPropsFiles(document).find((x) => true)}`;

        const fileContent = fs.readFileSync(filePath, "utf-8");
        const parsed = parser.parse(fileContent);

        const keys = Object.keys(parsed.Project.PropertyGroup);
        if (keys.some((x) => x === tag.property)) {
          return;
        }

        parsed.Project.PropertyGroup[tag.property] = tag.value;
        console.debug(parsed);
        const jsonToXml = new JsonToXml({
          format: true,
        });
        var xml = jsonToXml.parse(parsed);
        console.debug(xml);
        fs.writeFileSync(filePath, xml);
      }
    )
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
      const replaceXmlTag = this.createFixCommand(document, range, xmlTag);
      actions.push(replaceXmlTag);
    }

    if (xmlAttributesTag && xmlAttributesTag.length) {
      xmlAttributesTag.forEach((attr) => {
        const replaceXmlTag = this.createFixCommand(document, range, attr);
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
      const slug = slugify(includeAttr.value, { remove: /[\.\/\\]/g });
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

  private createFixCommand(
    document: vscode.TextDocument,
    range: vscode.Range,
    tag: any
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      `Extract ${tag.name} [${tag.value}] to props file`,
      vscode.CodeActionKind.QuickFix
    );
    action.command = {
      command: COMMAND_APPENDPROPSFILE,
      title: "Append props file if not exists",
      arguments: [tag, document, range],
    };

    return action;
  }

  private createCommand(): vscode.CodeAction {
    const action = new vscode.CodeAction(
      "Learn more...",
      vscode.CodeActionKind.Empty
    );
    action.command = {
      command: COMMAND_MARKETPLACE,
      title: "Learn more about this extension",
      tooltip: "This will open extensions market place page.",
    };
    return action;
  }
}

function GetParametersFileContent(
  document: vscode.TextDocument,
  importFileName: string
) {
  const documentFilePath = path.parse(document.fileName).dir;
  const importFilePath = path.join(documentFilePath, importFileName);
  const file = fs.readFileSync(importFilePath, "utf-8");
  return file;
}

// this method is called when your extension is deactivated
export function deactivate() {}
