const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs
	.readFileSync(path.join(__dirname, "gecko.css"), "utf8")
	.replace(/\s+/g, " ");

test("Given a mobile cross result with multiple HETs, when the table renders, then labels stay inside the viewport", () => {
	assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.rtable \{[^}]*table-layout: fixed;[^}]*width: 100%;/);
	assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.c-vis,[^}]*\.c-het \{[^}]*min-width: 0;/);
	assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.het100,[^}]*\.hetp,[^}]*\.crosstag \{[^}]*max-width: 100%;[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
});
