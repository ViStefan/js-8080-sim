'use strict';
'use esversion: 8';

// This is for jshint that will worry it can't find js8080sim, which is injected
// in a <script> tag in the HTML.
/* globals js8080sim: false */

var editor = js8080sim.ace.edit('codetext');
editor.setTheme('ace/theme/solarized_light');

var currentStep = 0;

const STORAGE_ID = 'js8080sim';

// Set up listeners.
const codetext = document.querySelector('#codetext');
const maxsteps = document.querySelector('#maxsteps');
const ramstart = document.querySelector('#ramstart');
const ramshowmode = document.querySelector('#ramshowmode');
document.querySelector("#run").addEventListener("mousedown", () => dispatchStep("run"));
document.querySelector("#prev").addEventListener("mousedown", () => dispatchStep("prev"));
document.querySelector("#next").addEventListener("mousedown", () => dispatchStep("next"));
document.querySelector("#runtocursor").addEventListener("mousedown", () => dispatchStep("runtocursor"));
document.querySelector("#setsample").addEventListener("mousedown", onSetSample);
document.querySelector("#showramstart").addEventListener("mousedown", onShowRamStart);
document.querySelector("#ramstart").addEventListener("keyup", onRamStartKey);
document.querySelector("#ramshowmode").addEventListener("change", onRamShowMode);


let codeSamples = [
  {'name': '', 'code': ''},

  {'name': 'add-array-indirect',
   'code': `
; The sum will be accumulated into d
  mvi d, 0

; Demonstrates indirect addressing, by keeping
; a "pointer" to myArray in bc.
  lxi bc, myArray

; Each iteration: load next item from myArray
; (until finding 0) into a. Then accumulate into d.
Loop:
  ldax bc
  cpi 0
  jz Done
  add d
  mov d, a
  inr c
  jmp Loop

Done:
  hlt

myArray:
  db 10h, 20h, 30h, 10h, 20h, 0
`},

  {'name': 'labeljump',
   'code': `
  mvi a, 1h
  dcr a
  jz YesZero
  jnz NoZero

YesZero:
  mvi c, 20
  hlt

NoZero:
  mvi c, 50
  hlt
`},

  {'name': 'capitalize',
   'code': `
  lxi hl, str
  mvi c, 14
  call Capitalize
  hlt

Capitalize:
  mov a, c
  cpi 0
  jz AllDone

  mov a, m
  cpi 61h
  jc SkipIt

  cpi 7bh
  jnc SkipIt

  sui 20h
  mov m, a

SkipIt:
  inx hl
  dcr c
  jmp Capitalize

AllDone:
  ret

str:
  db 'hello, friends'
  `},

  {'name': 'memcpy',
   'code': `
  lxi de, SourceArray
  lxi hl, TargetArray
  mvi b, 0
  mvi c, 5
  call memcpy
  hlt

SourceArray:
  db 11h, 22h, 33h, 44h, 55h

TargetArray:
  db 0, 0, 0, 0, 0, 0, 0, 0, 0, 0

  ; bc: number of bytes to copy
  ; de: source block
  ; hl: target block
memcpy:
  mov     a,b         ;Copy register B to register A
  ora     c           ;Bitwise OR of A and C into register A
  rz                  ;Return if the zero-flag is set high.
loop:
  ldax    de          ;Load A from the address pointed by DE
  mov     m,a         ;Store A into the address pointed by HL
  inx     de          ;Increment DE
  inx     hl          ;Increment HL
  dcx     bc          ;Decrement BC   (does not affect Flags)
  mov     a,b         ;Copy B to A    (so as to compare BC with zero)
  ora     c           ;A = A | C      (set zero)
  jnz     loop        ;Jump to 'loop:' if the zero-flag is not set.
  ret                 ;Return
`}

];

// Code samples.
let samples = document.querySelector("#samples");
for (let sample of codeSamples) {
  let option = elt("option", sample.name);
  option.setAttribute('value', sample.name);
  samples.appendChild(option);
}

// Create and populate the CPU state table.
const cpuStateTable = document.querySelector('#cpuState');
const registers = ['a', 'b', 'c', 'd', 'e',
                   'h', 'l', 'pc', 'sp', 'halted'];
const registerWidths = {
  'a': 2,
  'b': 2,
  'c': 2,
  'd': 2,
  'e': 2,
  'h': 2,
  'l': 2,
  'pc': 4,
  'sp': 4,
  'halted': 1
};

let cpuStateValues = {};

let row;
for (let i = 0; i < registers.length; i++) {
  if (i % 5 == 0) {
    row = elt("tr");
  }

  let regname = registers[i];
  cpuStateValues[regname] = document.createTextNode("");
  let nameElem = elt("td", `${regname}:`);
  nameElem.classList.add("regName");
  row.appendChild(nameElem);
  row.appendChild(elt("td", cpuStateValues[regname]));

  if (i % 5 == 4) {
    cpuStateTable.appendChild(row);
  }
}

// Create and populate the flags table.
let flags = ['Sign', 'Zero', 'Parity', 'Carry'];
let flagsStateValues = {};

let flagRow = elt("tr");
for (let i = 0; i < flags.length; i++) {
  let flagname = flags[i];
  let headtd = elt("td", flagname + ':');
  headtd.classList.add("flagHeader");
  flagsStateValues[flagname] = document.createTextNode("");
  flagRow.appendChild(headtd);
  flagRow.appendChild(elt("td", flagsStateValues[flagname]));
}
document.querySelector('#flags').appendChild(flagRow);

// Create and populate the RAM table.
const ramTable = document.querySelector('#ram');
let headrow = elt("tr", elt("td"));
for (let i = 0; i < 16; i++) {
  let headtd = elt("td", `${formatNum(i, 0)}`);
  headtd.classList.add("ramHeader");
  headrow.appendChild(headtd);
}
ramTable.appendChild(headrow);

const NROWS = 16;
let ramValues = [];
for (let i = 0; i < NROWS; i++) {
  let row = elt("tr");
  let headtd = elt("td", `${formatNum(i, 3)}`);
  headtd.classList.add("ramHeader");
  row.appendChild(headtd);

  for (let i = 0; i < 16; i++) {
    let ramval = document.createTextNode("00");
    ramValues.push(ramval);
    row.appendChild(elt("td", ramval));
  }
  ramTable.appendChild(row);
}

loadUiState();

function loadUiState() {
  let state = JSON.parse(localStorage.getItem(STORAGE_ID));

  // Defaults that will be overridden when reading state.
  maxsteps.value = "10000";
  ramstart.value = "0000";

  if (state) {
    editor.setValue(state.codetext, 1);
    if (state.maxsteps !== undefined) {
      maxsteps.value = state.maxsteps;
    }
    if (state.ramstart !== undefined) {
      ramstart.value = state.ramstart;
    }
  }

  setStatusReady();
}

function saveUiState() {
  let state = {
    'codetext': editor.getValue(),
    'maxsteps': maxsteps.value
  };
  localStorage.setItem(STORAGE_ID, JSON.stringify(state));
}

function setStatusFail(msg) {
  let st = document.querySelector("#status");
  st.textContent = "FAIL: " + msg;
  st.style.color = "red";
}

function setStatusSuccess() {
  let st = document.querySelector("#status");
  st.textContent = "SUCCESS";
  st.style.color = "green";
}

function setStatusReady() {
  let st = document.querySelector("#status");
  st.textContent = "Ready to run";
}

// Saves the mem values from the last run, so we could show different parts of
// RAM per the user's request in the RAM table.
let memFromLastRun = new Array(65536).fill(0);

// Checks if the value in the maxsteps box is valid; throws exception if not.
function checkSteps() {
    if (maxsteps.value === 'undefined' || isNaN(parseInt(maxsteps.value)) ||
        parseInt(maxsteps.value) < 0) {
    throw new Error(`Steps value is invalid`);
  }
}

function dispatchStep(event) {
  try {
    checkSteps();
    switch (event) {
    case "run":
      onRunCode();
      break;
    case "next":
      onNextStep();
      break;
    case "prev":
      onPrevStep();
      break;
    case "runtocursor":
      onRunCode(editor.getCursorPosition().row);
      break;
    }
  } catch (e) {
    if (e instanceof js8080sim.ParseError ||
        e instanceof js8080sim.AssemblyError) {
      setStatusFail(`${e}`);
    } else {
      setStatusFail(e.message);
    }
    throw(e);
  }
}

function onNextStep() {
  let step = parseInt(maxsteps.value);
  maxsteps.value = step + 1;
  onRunCode();
}

function onPrevStep() {
  if (maxsteps.value > 0) {
    let step = parseInt(maxsteps.value);
    maxsteps.value = step - 1;
    onRunCode();
  }
}

async function onRunCode(cursor) {
  saveUiState();

  let prog = editor.getValue();

  let [state, mem, labelToAddr] = await runProg(prog, parseInt(maxsteps.value), cursor, editor.session.getBreakpoints());
  memFromLastRun = mem;

  // Populate CPU state / registers.
  for (let regName of Object.keys(state)) {
    if (cpuStateValues.hasOwnProperty(regName)) {
      let valueElement = cpuStateValues[regName];
      let width = registerWidths[regName];
      valueElement.textContent = formatNum(state[regName], width);
    } else if (regName === 'f') {
      let regval = state[regName];
      flagsStateValues.Sign.textContent = formatNum((regval >> 7) & 0x01, 2);
      flagsStateValues.Zero.textContent = formatNum((regval >> 6) & 0x01, 2);
      flagsStateValues.Parity.textContent = formatNum((regval >> 2) & 0x01, 2);
      flagsStateValues.Carry.textContent = formatNum(regval & 0x01, 2);
    } else {
      console.log('cannot find state value for', regName);
    }
  }

  // Populate RAM table.
  ramstart.value = "0000";
  populateRamTable();

  // Populate labels table.
  const labelTable = document.querySelector('#labels');
  labelTable.innerHTML = '';
  for (let [key, value] of labelToAddr.entries()) {
    let row = elt("tr");
    let keyCol = elt("td", key + ':');
    keyCol.classList.add("labelName");
    let valCol = elt("td", formatNum(value, 4));
    row.append(keyCol, valCol);
    labelTable.appendChild(row);
  }

  setStatusSuccess();
}

const delay = millis => new Promise((resolve, reject) => {
  setTimeout(_ => resolve(), millis);
});

function onRamStartKey(event) {
  if (event.keyCode == 13) {
    onShowRamStart();
    event.stopPropagation();
    event.preventDefault();
  }
}

async function runProg(progText, maxSteps, cursor, breakpoints) {
  let p = new js8080sim.Parser();
  let asm = new js8080sim.Assembler();
  let sourceLines = p.parse(progText);
  let [mem, labelToAddr] = asm.assemble(sourceLines);

  const memoryTo = (addr, value) => {
    mem[addr] = value;
  };
  const memoryAt = (addr) => {
    return mem[addr];
  };
  js8080sim.CPU8080.init(memoryTo, memoryAt);
  js8080sim.CPU8080.set('PC', 0);

  for (let i = 0; i < currentStep; i++) {
    js8080sim.CPU8080.steps(1);
    console.log('pc before: ' + js8080sim.CPU8080.status().pc);
  }

  maxSteps = 50000;
  // if (maxSteps === undefined) {
  //   maxSteps = 50000;
  // }

  let breakpointPcs = breakpoints
      .map((x, y) => sourceLines
              .filter((s) => s.pos.line === y + 1)
              .map((f) => f.pc)[0]);

  console.log(breakpointPcs);

  for (let i = currentStep; i < maxSteps; i++) {
    // if (!js8080sim.CPU8080.status().halted)
    js8080sim.CPU8080.steps(1);

    console.log('pc after: ' + js8080sim.CPU8080.status().pc);

    highlightCurrentLine(sourceLines, js8080sim.CPU8080.status().pc);
    await delay(50);

    if (breakpointPcs.indexOf(js8080sim.CPU8080.status().pc) !== -1) {
      // console.log(breakpointPcs, js8080sim.CPU8080.status().pc);
      currentStep = i + 1;
      maxsteps.value = currentStep;
      console.log(i);
      break;
    }

    if (js8080sim.CPU8080.status().halted) {
      currentStep = i;
      break;
    }
  }
  
  highlightCurrentLine(sourceLines, js8080sim.CPU8080.status().pc);

  return [js8080sim.CPU8080.status(), mem, labelToAddr];
}

editor.on('gutterclick', function(e) {
  let row = e.getDocumentPosition().row;

  if (e.editor.session.getBreakpoints()[row] !== undefined) {
    e.editor.session.clearBreakpoint(row);
  } else {
    e.editor.session.setBreakpoint(row, 'breakpoint');
  }
});

function highlightCurrentLine(sourceLines, pc) {
  Object.values(editor.session.getMarkers())
      .filter((x) => x.clazz == 'ace_step')
      .map((x) => editor.session.removeMarker(x.id));
  for (let sl of sourceLines)
  {
    if (sl.pc === pc && ! sl.label)
    {
      let Range = js8080sim.ace.Range;
      editor.session.addMarker(new Range(sl.pos.line - 1, 0, sl.pos.line - 1, 1), 'ace_step', 'fullLine');
      return;
    }
  }
}

function onSetSample() {
  let samples = document.querySelector("#samples");
  let selectedSampleCode = codeSamples[samples.selectedIndex];
  editor.setValue(selectedSampleCode.code.replace(/^\n+/, ''), 1);
}

function onShowRamStart() {
  populateRamTable();
}

function onRamShowMode() {
  populateRamTable();
}

function populateRamTable() {
  // Calculate start address for the first entry in the displayed RAM table.
  let startAddr = parseInt(ramstart.value, 16) & 0xfff0;
  if (startAddr > 0xff00) {
    startAddr = 0xff00;
    ramstart.value = formatNum(startAddr, 4);
  }
  let headerStart = startAddr;

  // Set table row headers.
  for (let i = 1; i < ramTable.children.length; i++) {
    let headerTd = ramTable.children[i].firstChild;
    headerTd.textContent = formatNum(headerStart, 4).slice(0, 3);
    headerStart += 16;
  }

  const useAscii = ramshowmode.value == "ASCII";

  // Set table contents.
  for (let i = 0; i < 16 * 16; i++) {
    let memIndex = startAddr + i;
    let value = memFromLastRun[memIndex];
    if (memIndex == js8080sim.CPU8080.status().pc) {
      ramValues[i].parentElement.style.background = "#ffffc1";
      ramValues[i].parentElement.style.fontWeight = "bold";
    } else {
      ramValues[i].parentElement.style.background = "inherit";
      ramValues[i].parentElement.style.fontWeight = "normal";
    }
    ramValues[i].textContent = useAscii ?
      ('.' + formatAscii(value)) :
      formatNum(value, 2);
  }
}

function elt(type, ...children) {
  let node = document.createElement(type);
  for (let child of children) {
    if (typeof child != "string") node.appendChild(child);
    else node.appendChild(document.createTextNode(child));
  }
  return node;
}

// formatNum formats a number as a hexadecimal string with zero padding.
// Set padding to 0 for "no padding".
function formatNum(n, padding) {
  return n.toString(16).toUpperCase().padStart(padding, 0);
}

// formatAscii formats the numeric code n as ASCII, with special treatment for
// non-printable characters.
function formatAscii(n) {
  let f;
  if (n >= 33 && n <= 126) {
    f = String.fromCharCode(n);
  } else {
    f = '.';
  }
  return f;
}
