import fs from "fs";
import jscodeshift from "jscodeshift";
import { downloadVoidpetWebsite } from "voidpetdownloader";

const s = await downloadVoidpetWebsite();
const mapping: {[k: string]: any} = {};
for(const chunk of Object.values(s) as string[]) {
    //match all lines that have numbers and : after them
    const regex = /\s*(,|\{)(\d+)\s*:\s*function\s*\(([^)]*)\)\s*\{/g;
    const matches = chunk.match(regex);
    if(matches === null) {
        continue
    }
    for(let match of matches) {
        match = match.substring(1);
        let counter = 1;
        const start = chunk.indexOf(match)
        let end = start + match.length;
        while(counter > 0) {
            let prev_ch = chunk[end-1];
            let ch = chunk[end];
            let next_ch = chunk[end+1];
            //check if end is regex (only works for voidpet-specific code right now) TODO: make this more generic
            if(ch === "/" && (prev_ch === " " || prev_ch === "(" || prev_ch === "=")) {
                do {
                    end++;
                    prev_ch = ch;
                    ch = chunk[end];
                    next_ch = chunk[end+1];
                } while(!(prev_ch !== "\\" && ch === "/"));
            }
            
            switch(ch) {
                case "{":
                    counter++;
                    break;
                case "}":
                    counter--;
                    break;
            }
            end++;
        }
        const function_raw = chunk.substring(start, end);
        let body = function_raw.substring(function_raw.indexOf(":")+1);
        const matches2 = body.match(/\(0,[^)]*\)\(\)/g);
        if(matches2 !== null) {
            for(const match2 of matches2) {
                const f_call = match2.substring(3, match2.length-3);
                body = body.replace(match2, " "+f_call+"()");
            }
        }
        const name = function_raw.split(":")[0];
        function getMapping(ast: jscodeshift.Collection<jscodeshift.FunctionDeclaration>) {
            const m: {[k: string]: any} = {};
            ast.findVariableDeclarators().forEach(path => {
                if(!m.hasOwnProperty("variables")) {
                    m["variables"] = {};
                }
                const name = path.get("id").node.name;
                m.variables[name] = name;
            });
            ast.find(jscodeshift.FunctionDeclaration).forEach(path => {
                if(!m.hasOwnProperty("functions")) {
                    m["functions"] = {};
                }
                const name = path.get("id").node.name;
                m.functions[name] = getMapping(jscodeshift(path));
                m.functions[name]["name"] = name;
            });
            const p = ast.get("params").value as jscodeshift.ASTPath<jscodeshift.Identifier>[];
            p.forEach((node: jscodeshift.ASTPath<jscodeshift.Identifier>) => {
                if(!m.hasOwnProperty("args")) {
                    m["args"] = {};
                }
                const name = node.name;
                m.args[name] = name;
            });
            return m;
        }
        const ast = jscodeshift(body.replace("function", "function $REPLACE$")).find(jscodeshift.FunctionDeclaration);
        mapping[name] = getMapping(ast);
        function a() {
            if(!mapping[name].hasOwnProperty("args")) {
                return;
            }
            const retArg = Object.keys(mapping[name].args)[2];
            if(retArg === undefined) {
                return;
            }
            const rootScope = ast.get("body").scope;
            ast.find(jscodeshift.CallExpression, {
                callee: {
                    type: 'MemberExpression',
                    object: { type: 'Identifier', name: mapping[name].args[retArg] },
                    property: { name: "d" }
                },
            }).filter(path => {
                let scope = path.scope;
                while (scope && scope !== rootScope) {
                    if (scope.declares(mapping[name].args[retArg])) {
                        return false;
                    }
                    scope = scope.parent;
                }
                return true;
            })
            .forEach(path => {
                const args = path.get("arguments").value[1].properties;
                args.forEach((node: jscodeshift.Property) => {
                    if(!mapping[name].hasOwnProperty("returns")) {
                        mapping[name]["returns"] = {};
                    }
                    const retName = (node.key as jscodeshift.Identifier).name;
                    mapping[name]["returns"][retName] = retName;
                });
            });
        };
        a();
    }
}
fs.writeFileSync("mapping.json", JSON.stringify(mapping, null, 4));