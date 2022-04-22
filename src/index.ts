import mapping from "./mapping/mapping";
import ts_morph, { Project } from "ts-morph";

async function applyMapping(name: keyof typeof mapping, body: string): Promise<string> {
    const mapping_obj_source = mapping[name];
    if(!mapping_obj_source) {
        return body;
    }
    const project = new Project();
    const sourceFile = project.createSourceFile("f"+name+"-"+Math.round(Math.random()*10000)+".js", body);
    sourceFile.getFunctionOrThrow("").getBodyOrThrow().forEachChild((node) => {
        const kind = node.getKind();
        if(kind === ts_morph.SyntaxKind.VariableStatement) {
            const var_stmt = node.asKindOrThrow(ts_morph.SyntaxKind.VariableStatement);
            const var_decl = var_stmt.getDeclarations();
            for(const decl of var_decl) {
                const name = decl.getName();
                if(mapping_obj_source.hasOwnProperty(name)) {
                    const new_name = mapping_obj_source[name as keyof typeof mapping_obj_source];
                    if(new_name) {
                        decl.getNameNode().replaceWithText(new_name);
                    }
                }
                decl.forget();
            }
            var_stmt.forget();
        }
        node.forget();
    })
    return sourceFile.compilerNode.getFullText();
}

//Parse next.js chunk into array of functions
function parseChunk(chunk: string) {
    //match all lines that have numbers and : after them
    const regex = /\s*(,|\{)(\d+)\s*:\s*function\s*\(([^)]*)\)\s*\{/g;
    const matches = chunk.match(regex);
    if(matches === null) {
        throw new Error("No matches found");
    }
    const functions = [];
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
        const promise = applyMapping(name as any, body).then((body) => {
            return {
                name: name,
                args: function_raw.split("(")[1].split(")")[0],
                body: body,
            }
        });
        functions.push(promise);
    }
    return Promise.all(functions);
}

function createCode(loadedFunctions: {[key: string]: {name: string, args: string, body: string}}, es_export: boolean) {
    let code = `var func_obj = {`;
    for(const func of Object.keys(loadedFunctions)) {
        const func_body = loadedFunctions[func].body;
        code += `\n${func}: function(${func_body.split("(")[1].split(")")[0]}) {${func_body.substring(func_body.indexOf("{")+1,func_body.length-1)}},`;
    }
    code += `\n}
var loaded = {};
${es_export ? "export default" : "module.exports ="} function load(v) {
    if(loaded[v]) {
        return loaded[v];
    } else {
        var b = {
            id: v,
            exports: {}
        };
        load.d = (obj1, obj2) => {
            b.exports = Object.assign(obj1, obj2);
        };
        if(!func_obj.hasOwnProperty(v)) {
            throw new Error("Function "+v+" not found");
        }
        const f = func_obj[v];
        f.call(b.exports, b, b.exports, load);
        loaded[v] = b;
        return b.exports;
    }
}`;
    return code;
}

export async function unchunkify(raw_chunks: string[], es_export: boolean) {
    const errors = [];
    const loadedFunctions: {[key: string]: {name: string, args: string, body: string}} = {};
    for(const chunk_raw of raw_chunks) {
        try {
            const chunk_unpacked = await parseChunk(chunk_raw);
            for(const func of chunk_unpacked) {
                loadedFunctions[func.name] = func;
            }
        } catch(e) {
            errors.push(e);
        }
    }
    
    return {code: createCode(loadedFunctions, es_export), errors};
}
