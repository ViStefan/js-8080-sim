// Collection of all objects we need in the browser, re-exported from a single
// file for use with Browserify (see Makefile).
'use strict';

const { Parser, ParseError } = require('../src/parser.js');
const { Assembler, AssemblyError } = require('../src/assembler.js');
const CPU8080 = require('../src/sim8080');
const ace = require('ace-builds/src-min-noconflict/ace');
const solarized = require('ace-builds/src-min-noconflict/theme-solarized_light');

module.exports.Assembler = Assembler;
module.exports.AssemblyError = AssemblyError;
module.exports.Parser = Parser;
module.exports.ParseError = ParseError;
module.exports.CPU8080 = CPU8080;
module.exports.ace = ace;
// module.exports.solarized = solarized;
