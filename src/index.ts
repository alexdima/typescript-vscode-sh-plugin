/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export = function init(modules: { typescript: typeof import("typescript/lib/tsserverlibrary") }) {
	console.log('typescript-vscode-sh-plugin initialized, replacing getEncodedSemanticClassifications and getEncodedSyntacticClassifications.');

	const ts = modules.typescript;

	function decorate(languageService: ts.LanguageService) {

		const intercept: Partial<ts.LanguageService> = Object.create(null);

		intercept.getEncodedSemanticClassifications = (filename: string, span: ts.TextSpan) => {
			return {
				spans: getSemanticTokens(languageService, filename, span),
				endOfLineState: ts.EndOfLineState.None
			}
		};

		intercept.getEncodedSyntacticClassifications = (_filename: string, _span: ts.TextSpan) => {
			return {
				spans: [],
				endOfLineState: ts.EndOfLineState.None
			}
		};

		return new Proxy(languageService, {
			get: (target: any, property: keyof ts.LanguageService) => {
				return intercept[property] || target[property];
			},
		});
	}

	const tokenFromDeclarationMapping: { [name: string]: TokenType } = {
		[ts.SyntaxKind.VariableDeclaration]: TokenType.variable,
		[ts.SyntaxKind.Parameter]: TokenType.parameter,
		[ts.SyntaxKind.PropertyDeclaration]: TokenType.property,
		[ts.SyntaxKind.ModuleDeclaration]: TokenType.namespace,
		[ts.SyntaxKind.EnumDeclaration]: TokenType.enum,
		[ts.SyntaxKind.EnumMember]: TokenType.property,
		[ts.SyntaxKind.ClassDeclaration]: TokenType.class,
		[ts.SyntaxKind.MethodDeclaration]: TokenType.member,
		[ts.SyntaxKind.FunctionDeclaration]: TokenType.function,
		[ts.SyntaxKind.MethodSignature]: TokenType.member,
		[ts.SyntaxKind.GetAccessor]: TokenType.property,
		[ts.SyntaxKind.PropertySignature]: TokenType.property,
		[ts.SyntaxKind.InterfaceDeclaration]: TokenType.interface,
		[ts.SyntaxKind.TypeAliasDeclaration]: TokenType.type,
		[ts.SyntaxKind.TypeParameter]: TokenType.typeParameter
	};

	function getSemanticTokens(jsLanguageService: ts.LanguageService, fileName: string, span: ts.TextSpan): number[] {
		let resultTokens: number[] = [];

		const program = jsLanguageService.getProgram();
		if (program) {
			const typeChecker = program.getTypeChecker();

			function visit(node: ts.Node) {
				if (!node || !ts.textSpanIntersectsWith(span, node.pos, node.getFullWidth())) {
					return;
				}
				if (ts.isIdentifier(node)) {
					const symbol = typeChecker.getSymbolAtLocation(node);
					if (symbol) {
						const decl = symbol.valueDeclaration || symbol.declarations && symbol.declarations[0];
						if (decl) {
							let typeIdx = tokenFromDeclarationMapping[decl.kind];
							if (typeIdx !== undefined) {
								let modifierSet = 0;
								if (node.parent) {
									const parentTypeIdx = tokenFromDeclarationMapping[node.parent.kind];
									if (parentTypeIdx === typeIdx && (<ts.NamedDeclaration>node.parent).name === node) {
										modifierSet = TokenModifier.declaration;
									}
								}
								const modifiers = ts.getCombinedModifierFlags(decl);
								if (modifiers & ts.ModifierFlags.Static) {
									modifierSet |= TokenModifier.static;
								}
								if (modifiers & ts.ModifierFlags.Async) {
									modifierSet |= TokenModifier.async;
								}
								resultTokens.push(node.getStart(), node.getWidth(), typeIdx + modifierSet);
							}
						}
					}
				}
				ts.forEachChild(node, visit);
			}
			const sourceFile = program.getSourceFile(fileName);
			if (sourceFile) {
				visit(sourceFile);
			}
		}

		return resultTokens;
	}

	return {
		create(info: ts.server.PluginCreateInfo) {
			return decorate(info.languageService);
		},
		onConfigurationChanged(_config: any) {
		},
	};
};

const enum TokenType {
	'class' = 0x100,
	'enum' = 0x200,
	'interface' = 0x300,
	'namespace' = 0x400,
	'typeParameter' = 0x500,
	'type' = 0x600,
	'parameter' = 0x700,
	'variable' = 0x800,
	'property' = 0x900,
	'constant' = 0xA00,
	'function' = 0xB00,
	'member' = 0xC00
}

const enum TokenModifier {
	'declaration' = 0x01,
	'static' = 0x02,
	'async' = 0x04
}
