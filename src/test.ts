import { downloadVoidpetWebsite } from "voidpetdownloader";
import beautify from "js-beautify";
import fs from "fs";
import { unchunkify } from "./index.js";

const w = await downloadVoidpetWebsite();
const c = await unchunkify(Object.values(w), true);
console.log(c.errors);
fs.writeFileSync("./test.js", beautify(c.code, {"indent_with_tabs": true, "indent_size": 1}), "utf-8");