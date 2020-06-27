// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

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

  const pppp = vscode.languages.registerCompletionItemProvider("xml", {
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

          // a completion item that can be accepted by a commit character,
          // the `commitCharacters`-property is set which means that the completion will
          // be inserted and then the character will be typed.
          const commitCharacterCompletion = new vscode.CompletionItem(
            "console"
          );
          commitCharacterCompletion.commitCharacters = ["."];
          commitCharacterCompletion.documentation = new vscode.MarkdownString(
            "Press `.` to get `console.`"
          );

          completions.push(commitCharacterCompletion);
          // a simple completion item which inserts `Hello World!`
          // return all completion items as array
          return completions;

          console.debug(parameters);
        } catch (error) {
          console.error(error);
        }
      }
      return [];
    },
  });

  const provider1 = vscode.languages.registerCompletionItemProvider(
    "plaintext",
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
      ) {
        // a simple completion item which inserts `Hello World!`
        const simpleCompletion = new vscode.CompletionItem("Hello World!");

        // a completion item that inserts its text as snippet,
        // the `insertText`-property is a `SnippetString` which will be
        // honored by the editor.
        const snippetCompletion = new vscode.CompletionItem(
          "Good part of the day"
        );
        snippetCompletion.insertText = new vscode.SnippetString(
          "Good ${1|morning,afternoon,evening|}. It is ${1}, right?"
        );
        snippetCompletion.documentation = new vscode.MarkdownString(
          "Inserts a snippet that lets you select the _appropriate_ part of the day for your greeting."
        );

        // a completion item that can be accepted by a commit character,
        // the `commitCharacters`-property is set which means that the completion will
        // be inserted and then the character will be typed.
        const commitCharacterCompletion = new vscode.CompletionItem("console");
        commitCharacterCompletion.commitCharacters = ["."];
        commitCharacterCompletion.documentation = new vscode.MarkdownString(
          "Press `.` to get `console.`"
        );

        // a completion item that retriggers IntelliSense when being accepted,
        // the `command`-property is set which the editor will execute after
        // completion has been inserted. Also, the `insertText` is set so that
        // a space is inserted after `new`
        const commandCompletion = new vscode.CompletionItem("new");
        commandCompletion.kind = vscode.CompletionItemKind.Keyword;
        commandCompletion.insertText = "new ";
        commandCompletion.command = {
          command: "editor.action.triggerSuggest",
          title: "Re-trigger completions...",
        };

        // return all completion items as array
        return [
          simpleCompletion,
          snippetCompletion,
          commitCharacterCompletion,
          commandCompletion,
        ];
      },
    }
  );

  const provider2 = vscode.languages.registerCompletionItemProvider(
    "plaintext",
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        // get all text until the `position` and check if it reads `console.`
        // and if so then complete if `log`, `warn`, and `error`
        const linePrefix = document
          .lineAt(position)
          .text.substr(0, position.character);
        if (!linePrefix.endsWith("console.")) {
          return undefined;
        }

        return [
          new vscode.CompletionItem("log", vscode.CompletionItemKind.Method),
          new vscode.CompletionItem("warn", vscode.CompletionItemKind.Method),
          new vscode.CompletionItem("error", vscode.CompletionItemKind.Method),
        ];
      },
    },
    "." // triggered whenever a '.' is being typed
  );

  context.subscriptions.push(pppp, provider1, provider2);

  let disposable = vscode.commands.registerCommand(
    "csproj-extensions.toggleExtensionState",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("Activated!");
    }
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
