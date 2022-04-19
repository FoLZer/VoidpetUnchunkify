import mapping from "./mapping/mapping.json";


//input is a string of code
//(e,t,n){"use strict";var r=n(331);function l(){}function a(){}a.resetWarningCache=l,e.exports=function(){function e(e,t,n,l,a,o){if(o!==r){var u=new Error("Calling PropTypes validators directly is not supported by the `prop-types` package. Use PropTypes.checkPropTypes() to call them. Read more at http://fb.me/use-check-prop-types");throw u.name="Invariant Violation",u}}function t(){return e}e.isRequired=e;var n={array:e,bool:e,func:e,number:e,object:e,string:e,symbol:e,any:e,arrayOf:t,element:e,elementType:e,instanceOf:t,node:e,objectOf:t,oneOf:t,oneOfType:t,shape:t,exact:t,checkPropTypes:a,resetWarningCache:l};return n.PropTypes=n,n}}
//change all variables and functions to their names in mapping object
//mapping object is of structure {"function_name": {"returns": {"name": "new_name"}, "variables": {"name":"new_name"}, "functions": {"name":"new_name"}}}
/* WIP
function applyMappingToFunction(name: keyof typeof mapping, body: string) {
    const mapping_obj = mapping[name];
    if(mapping_obj === undefined) {
        return body;
    }
    if(mapping_obj.hasOwnProperty("variables")) {
        for(const variable of Object.keys(mapping_obj.variables)) {
            //replace all occurrences of variable name with new name, don't change if this variable included in function inside
            const regex = new RegExp(`\\b${variable}\\b`, "g");
            body = body.replace(regex, mapping_obj.variables[variable]);
        }
    }
}
*/

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
                body = body.replace(match2, f_call+"()");
            }
        }
        const name = function_raw.split(":")[0]
        //body = applyMapping(name, body);
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
        return loaded[v];
    } else {
        var b = {};
        load.d = (obj1, obj2) => {
            b = Object.assign(obj1, obj2);
        }
        func_obj[v](null,b,load)
        loaded[v] = b;
        return b;
    }
}`;
    return code;
}

export function unchunkify(raw_chunks: string[], es_export: boolean) {
    const loadedFunctions: {[key: string]: {name: string, args: string, body: string}} = {};
    for(const chunk_raw of raw_chunks) {
        try {
            const chunk_unpacked = parseChunk(chunk_raw);
            for(const func of chunk_unpacked) {
                loadedFunctions[func.name] = func;
            }
        } catch(e) {
            console.log("Failed to parse chunk:",e);
        }
    }
    
    return createCode(loadedFunctions, es_export);
}
