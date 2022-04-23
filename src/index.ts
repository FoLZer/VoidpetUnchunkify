import mappings from "./mapping/mapping.js";
import jscodeshift from "jscodeshift";

import register from "./jscodeshiftMethods.js";
register();

function applyMapping(ast: jscodeshift.Collection<any>, mapping: {[k: string]: any}) {
    if(mapping.hasOwnProperty("variables")) {
        for(const prev_var_name of Object.keys(mapping.variables)) {
            const new_var_name = mapping.variables[prev_var_name as keyof typeof mappings];
            ast.findVariableDeclarators(prev_var_name).at(0).renameTo(new_var_name);
        }
    }

    if(mapping.hasOwnProperty("function_declarations")) {
        for(const prev_func_name of Object.keys(mapping.function_declarations)) {
            const new_func = mapping.function_declarations[prev_func_name as keyof typeof mappings];
            const func_decl = ast.find(jscodeshift.FunctionDeclaration, {id: {name: prev_func_name}}).at(0);
            func_decl.get("id");
            func_decl.renameTo(new_func.name);
            applyMapping(func_decl, mapping.function_declarations[prev_func_name as keyof typeof mappings]);
        }
    }
    
    return ast;
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
        if(mappings.hasOwnProperty(name)) {
            let ast = jscodeshift(body.replace("function", "function $REPLACE$"));
            ast = applyMapping(ast, mappings[name as keyof typeof mappings]);
            body = ast.toSource().replace("function $REPLACE$", "function");
        }
        functions.push({
            name: name,
            args: function_raw.split("(")[1].split(")")[0],
            body: body,
        });
    }
    return functions;
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
        return loaded[v].exports;
    } else {
        var b = {
            id: v,
            exports: {}
        };
        load.d = function(obj1, obj2) {
            for(var key in obj2) {
                if(Object.prototype.hasOwnProperty.call(obj2, key) && !Object.prototype.hasOwnProperty.call(obj1, key)) {
                    Object.defineProperty(obj1, key, {
                        enumerable: true,
                        get: obj2[key]
                    });
                }
            }
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
