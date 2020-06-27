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
}

// this method is called when your extension is deactivated
export function deactivate() {}
