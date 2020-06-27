# csproj-extensions

It will powerup your csproj files while you editing it in VS Code.

## Features

Now, it only supports parameters (props) files like `<Import Project="dependencies.props" />`. It will add a completion for those parameters.

For example. If you have a props file depended to your csproj file, It will show you the parameters that you can use.

### Example csproj file

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <Import Project="dependencies.props" />
  <PropertyGroup>
    <TargetFramework>$(DotNetCoreAppVersion)</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="System.Management.Automation" Version="$(ManagementAutomationVersion)" />
  </ItemGroup>
</Project>
```

### Example props file

```xml
<Project>
  <PropertyGroup>
    <DotNetCoreAppVersion>netcoreapp3.1</DotNetCoreAppVersion>
	<ManagementAutomationVersion>6.2.4</ManagementAutomationVersion>
  </PropertyGroup>
</Project>
```

### In action

![How it works?](screenshot/how-it-works.gif)