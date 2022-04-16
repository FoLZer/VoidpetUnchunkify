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
        functions.push({
            name: function_raw.split(":")[0],
            args: function_raw.split("(")[1].split(")")[0],
            body: body,
        });
    }
    return functions;
}

function createCode(loadedFunctions: {[key: string]: {name: string, args: string, body: string}}) {
    let code = `var func_obj = {`;
    for(const func of Object.keys(loadedFunctions)) {
        const func_body = loadedFunctions[func].body;
        code += `\n${func}: function(${func_body.split("(")[1].split(")")[0]}) {${func_body.substring(func_body.indexOf("{")+1,func_body.length-1)}},`;
    }
    code += `\n}
    var loaded = {};
    module.exports = function load(v) {
        if(loaded[v]) {
            return loaded[v];
        } else {
            var b={};
            func_obj[v](null,b,load)
            loaded[v] = b;
            return b;
        }
    }
    `;
    return code;
}

export default function parse(raw_chunks: string[]) {
    const loadedFunctions: {[key: string]: {name: string, args: string, body: string}} = {};
    for(const chunk_raw of raw_chunks) {
        const chunk_unpacked = parseChunk(chunk_raw);
        for(const func of chunk_unpacked) {
            loadedFunctions[func.name] = func;
        }
    }
    
    return createCode(loadedFunctions);
}