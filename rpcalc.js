//  rpCalc, a simple reverse polish notation calculator

//  Copyright (C) 2016, Douglas W. Bell

//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU Affero General Public License, either
//  version 3 of the License, or any later version.  This program is
//  distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY.
//  See <http://www.gnu.org/licenses/> for details.

"use strict";
var progName = "rpCalc";
var version = "0.1.0";

var mode = {
    ENTRYMODE:  1,  // in num entry - adds to num string
    SAVEMODE:   2,  // after result - previous result becomes Y
    REPLMODE:   3,  // after enter key - replaces X
    EXPMODE:    4,  // in exponent entry
    MEMSTOMODE: 5,  // memory register entry - needs 0-9 to store
    MEMRCLMODE: 6,  // memory register entry - needs 0-9 to recall
    DECPLCMODE: 7}; // in decimal place entry (0-9)

var state = mode.SAVEMODE;
var showPlacesMode = false;
var skipDisplayUpdate = false;

var angleUnit = "deg";
var decPlaces = 4;
var sciNotation = false;
var showReg = true;
var storeStack = true;
var memory = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

restoreSettings();

function angleConv() {
    switch (angleUnit) {
        case "deg":
            return Math.PI / 180;
        case "rad":
            return 1;
        default:
            return Math.PI / 200;
    }
}

function Stack() {
    this.values = [0.0, 0.0, 0.0, 0.0];
    this.xStr = "";

    this.replaceXY = function(num) {  // consume x & y with num result
        this.values.shift();
        this.values[0] = num;
        this.values.push(this.values[2]);
        this.updateXStr();
    }
    this.replaceX = function(num) {
        this.values[0] = num;
        this.updateXStr();
    }
    this.enterX = function() {
        this.values.unshift(this.values[0]);
        this.values.pop();
        this.updateXStr();
    }
    this.newX = function(num) {  // insert new x without consuming
        this.values.unshift(num);
        this.values.pop();
        this.updateXStr();
    }
    this.swapXY = function() {
        var tmp = this.values[0];
        this.values[0] = this.values[1];
        this.values[1] = tmp;
        this.updateXStr();
    }
    this.rollBack = function() {  // roll stack so x = old y, etc.
        this.values.push(this.values[0]);
        this.values.shift();
        this.updateXStr();
    }
    this.rollUp = function() {  // roll stack so x = old stack bottom
        this.values.unshift(this.values[3]);
        this.values.pop();
        this.updateXStr();
    }
    this.clear = function() {
        this.values = [0.0, 0.0, 0.0, 0.0];
        this.updateXStr();
    }
    this.updateX = function() {
        var str = this.xStr;
        if (str.indexOf("x10") >= 0) {
            str = str.replace("</sup>", "");
            str = str.replace(" x10<sup>", "e");
        }
        this.values[0] = Number(str);
    }
    this.updateXStr = function() {
        this.xStr = this.numStr(this.values[0]);
    }
    this.regOutput = function() {  // previous register output
        var text = "";
        var part;
        for (i = 3; i >= 1; i--) {
            text = text + this.numStr(this.values[i]) + "<br>";
        };
        return text;
    }
    this.numStr = function(num) {
        var absNum = Math.abs(num);
        if (sciNotation || absNum >= 1e7 || (absNum <= 1e-4 && absNum != 0)) {
            var str = num.toExponential(decPlaces);
        } else {
            var str = num.toFixed(decPlaces);
        }
        if (str.search("e") >= 0) {
            str = str.replace("e", " x10<sup>") + "</sup>";
        }
        return str;
    }
    this.updateXStr();
}

var stack = new Stack();
restoreStack();

function SpecialKey(label) {
    this.label = label;
}

NumKey.prototype = new SpecialKey();
NumKey.prototype.constructor = NumKey;
function NumKey(label) {
    this.label = label;
}
NumKey.prototype.execKey = function() {
    if (state == mode.ENTRYMODE) {
        var str = stack.xStr + this.label;
        if (!(isNaN(Number(str)))) {
            stack.xStr = str;
            stack.updateX();
        }
    } else if (state < mode.EXPMODE) {
        if (state == mode.SAVEMODE) {
            stack.enterX();
        }
        stack.xStr = this.label;
        stack.updateX();
        state = mode.ENTRYMODE;
    } else if (state == mode.EXPMODE && this.label != ".") {
        stack.xStr = stack.xStr.replace("<sup>0", "<sup>");
        stack.xStr = stack.xStr.replace("</sup>", this.label + "</sup>");
        stack.updateX();
    } else if (state == mode.MEMSTOMODE) {
        memory[Number(this.label)] = stack.values[0];
        stack.updateXStr();
        state = mode.SAVEMODE;
        saveSettings();
    } else if (state == mode.MEMRCLMODE) {
        stack.newX(memory[Number(this.label)]);
        state = mode.SAVEMODE;
    } else if (state == mode.DECPLCMODE) {
        decPlaces = Number(this.label);
        stack.updateXStr();
        state = mode.SAVEMODE;
        updateStatus();
        saveSettings();
    }
}

EvalKey.prototype = new SpecialKey();
EvalKey.prototype.constructor = EvalKey;
function EvalKey(label, evalText) {
    this.label = label;
    this.evalText = evalText;
}
EvalKey.prototype.execKey = function() {
    var x = stack.values[0];
    var y = stack.values[1];
    var result = eval(this.evalText);
    stack.replaceXY(result);
    state = mode.SAVEMODE;
}

UnaryEvalKey.prototype = new SpecialKey();
UnaryEvalKey.prototype.constructor = UnaryEvalKey;
function UnaryEvalKey(label, evalText) {
    this.label = label;
    this.evalText = evalText;
}
UnaryEvalKey.prototype.execKey = function() {
    var x = stack.values[0];
    var result = eval(this.evalText);
    stack.replaceX(result);
    state = mode.SAVEMODE;
}

var keys = {};
for (var i = 0; i < 10; i++) {
    label = i.toString();
    keys[label] = new NumKey(label);
}
keys["."] = new NumKey(".");

keys["+"] = new EvalKey("+", "y + x");
keys["-"] = new EvalKey("-", "y - x");
keys["*"] = new EvalKey("*", "y * x");
keys["/"] = new EvalKey("/", "y / x");
keys["x^2"] = new UnaryEvalKey("x^2", "x * x");
keys["sqrt"] = new UnaryEvalKey("sqrt", "Math.sqrt(x)");
keys["y^x"] = new EvalKey("y^x", "Math.pow(y, x)");
keys["xrt"] = new EvalKey("xrt", "Math.pow(y, 1 / x)");
keys["rcip"] = new UnaryEvalKey("rcip", "1 / x");
keys["sin"] = new UnaryEvalKey("sin", "Math.sin(x * angleConv())");
keys["cos"] = new UnaryEvalKey("cos", "Math.cos(x * angleConv())");
keys["tan"] = new UnaryEvalKey("tan", "Math.tan(x * angleConv())");
keys["ln"] = new UnaryEvalKey("ln", "Math.log(x)");
keys["e^x"] = new UnaryEvalKey("e^x", "Math.exp(x)");
keys["asin"] = new UnaryEvalKey("asin", "Math.asin(x) / angleConv()");
keys["acos"] = new UnaryEvalKey("acos", "Math.acos(x) / angleConv()");
keys["atan"] = new UnaryEvalKey("atan", "Math.atan(x) / angleConv()");
keys["log"] = new UnaryEvalKey("log", "Math.log(x) / Math.log(10)");
keys["tn^x"] = new UnaryEvalKey("tn^x", "Math.pow(10, x)");

keys["ent"] = new SpecialKey("ent");
keys["\r"] = keys["ent"];
keys["ent"].execKey = function() {
    stack.enterX();
    state = mode.REPLMODE;
}
keys["sto"] = new SpecialKey("sto");
keys["sto"].execKey = function() {
    stack.xStr = "Reg 0-9:";
    state = mode.MEMSTOMODE;
}
keys["rcl"] = new SpecialKey("rcl");
keys["rcl"].execKey = function() {
    stack.xStr = "Reg 0-9:";
    state = mode.MEMRCLMODE;
}
keys["r<"] = new SpecialKey("r<");
keys["r<"].execKey = function() {
    stack.rollBack();
    state = mode.SAVEMODE;
}
keys["r>"] = new SpecialKey("r>");
keys["r>"].execKey = function() {
    stack.rollUp();
    state = mode.SAVEMODE;
}
keys["x<>y"] = new SpecialKey("x<>y");
keys["x<>y"].execKey = function() {
    stack.swapXY();
    state = mode.SAVEMODE;
}
keys["show"] = new SpecialKey("show");
keys["show"].execKey = function() {
    if (!showPlacesMode) {
        var str = stack.values[0].toExponential(11);
        str = str.replace("e", " x10<sup>") + "</sup>";
        document.getElementById("xValue").innerHTML = str;
        skipDisplayUpdate = true;
    }
    showPlacesMode = !showPlacesMode;
}
keys["reg"] = new SpecialKey("reg");
keys["reg"].execKey = function() {
    showReg = !showReg;
    saveSettings();
}
keys["plcs"] = new SpecialKey("plcs");
keys["plcs"].execKey = function() {
    stack.xStr = "Places 0-9:";
    state = mode.DECPLCMODE;
}
keys["sci"] = new SpecialKey("sci");
keys["sci"].execKey = function() {
    sciNotation = !sciNotation;
    stack.updateXStr();
    state = mode.SAVEMODE;
    updateStatus();
    saveSettings();
}
keys["deg"] = new SpecialKey("deg");
keys["deg"].execKey = function() {
    switch (angleUnit) {
        case "deg":
            angleUnit = "rad";
            break;
        case "rad":
            angleUnit = "grad";
            break;
        default:
            angleUnit = "deg";
            break;
    }
    updateStatus();
    saveSettings();
}
keys["clr"] = new SpecialKey("clr");
keys["clr"].execKey = function() {
    stack.clear();
    state = mode.SAVEMODE;
}
keys["pi"] = new SpecialKey("pi");
keys["pi"].execKey = function() {
    stack.newX(Math.PI);
    state = mode.SAVEMODE;
}
keys["exp"] = new SpecialKey("exp");
keys["exp"].execKey = function() {
    if (state == mode.EXPMODE) {
        return;
    }
    if (state == mode.SAVEMODE) {
        stack.enterX();
    }
    if (state !=mode.ENTRYMODE) {
        stack.xStr = "1";
    }
    stack.xStr += " x10<sup>0</sup>";
    stack.updateX();
    state = mode.EXPMODE;
}
keys["chs"] = new SpecialKey("chs");
keys["chs"].execKey = function() {
    if (state == mode.EXPMODE) {
        if (stack.xStr.indexOf("<sup>-") > 0) {
            stack.xStr = stack.xStr.replace("<sup>-", "<sup>");
        } else {
            stack.xStr = stack.xStr.replace("<sup>", "<sup>-");
        }
    } else {
        if (stack.xStr.slice(0, 1) == "-") {
            stack.xStr = stack.xStr.slice(1);
        } else {
            stack.xStr = "-" + stack.xStr;
        }
    }
    stack.updateX();
}
keys["<-"] = new SpecialKey("<-");
keys["<-"].execKey = function() {
    if (state == mode.ENTRYMODE && stack.xStr.length > 1 &&
            stack.xStr.slice(-2, -1) != "-") {
        stack.xStr = stack.xStr.slice(0, -1);
        stack.updateX();
    } else if (state == mode.EXPMODE) {
        var exp = /<sup>-?(\d*)<\/sup>/.exec(stack.xStr)[1];
        if (exp.length > 1) {
            var newExp = exp.slice(0, -1);
        } else if (exp != 0) {
            var newExp = "0";
        } else {
            stack.xStr = stack.xStr.split(" ")[0];
            stack.updateX();
            state = mode.ENTRYMODE;
            return;
        }
        stack.xStr = stack.xStr.replace(exp + "</sup>", newExp + "</sup>");
        stack.updateX();
    } else {
        stack.replaceX(0);
        state = mode.REPLMODE;
    }
}

var optModal = document.getElementById("optdialog");
keys["opt"] = new SpecialKey("opt");
keys["opt"].execKey = function() {
    document.getElementById("showreg").checked = showReg;
    document.getElementById("scinot").checked = sciNotation;
    document.getElementById("storestack").checked = storeStack;
    document.getElementById("decplcs").value = decPlaces;
    document.getElementById("angunits").value = angleUnit;
    optModal.style.display = "block";
}
var resetButton = document.getElementById("resetbutton");
resetButton.onclick = keys["opt"].execKey;
var submitButton = document.getElementById("submitbutton");
submitButton.onclick = function() {
    showReg = document.getElementById("showreg").checked;
    sciNotation = document.getElementById("scinot").checked;
    storeStack = document.getElementById("storestack").checked;
    decPlaces = document.getElementById("decplcs").value;
    if (decPlaces > 9) {
        decPlaces = 9;
    } else if (decPlaces < 0) {
        decPlaces = 0;
    }
    angleUnit = document.getElementById("angunits").value;
    optModal.style.display = "none";
    stack.updateXStr();
    state = mode.SAVEMODE;
    updateDisplay();
    updateStatus();
    saveSettings();
}
var closeButton = document.getElementById("closebutton");
closeButton.onclick = function() {
    optModal.style.display = "none";
}
window.onclick = function(event) {
    if (event.target == optModal) {
        optModal.style.display = "none";
    }
}

var partialKeys = {};
for (var label in keys) {
    for (i = 1; i < label.length; i++) {
        partialKeys[label.slice(0, i)] = true;
    }
}

function updateDisplay() {
    if (!skipDisplayUpdate) {
        if (showReg) {
            document.getElementById("regValue").innerHTML = stack.regOutput();
        } else {
            document.getElementById("regValue").innerHTML = "";
        }
        document.getElementById("xValue").innerHTML = stack.xStr;
        saveStack();
        showPlacesMode = false;
    }
    skipDisplayUpdate = false;
}

function updateStatus() {
    var statusStr = sciNotation ? "sci " : "fix ";
    statusStr += decPlaces.toString();
    statusStr += " " + angleUnit;
    document.getElementById("statusstring").innerHTML = statusStr;
}

updateDisplay();
updateStatus();

function buttonPress(button) {
    var key = keys[button.id];
    if (key && (state < mode.MEMSTOMODE || !(isNaN(Number(key.label))))) {
        key.execKey();
        updateDisplay();
        buttonDown(button);
    }
    button.blur();
}

function buttonDown(button) {
    button.style.border = "3px inset #d5c3b7";
    setTimeout(function() {
        button.style.border = "3px outset #d5c3b7";
    }, 300);
}

var entryString = "";
document.getElementById("entrystring").innerHTML =
    progName + "  Version " + version;
setTimeout(function() {
    if (!entryString) {
        document.getElementById("entrystring").innerHTML = "";
    }
}, 2000);

window.addEventListener("keydown", onKeyDown, false);
window.addEventListener("keypress", onKeyPress, false);

function onKeyDown(e) {
    // handle nonprintable backspace key
    if (e.which == 8 && optModal.style.display != "block") {
        if (entryString) {
            entryString = entryString.slice(0, -1);
        } else {
            entryString = "<-";
        }
        handleEntry();
        e.preventDefault();
    }
}

function onKeyPress(e) {
    // handle printable key presses
    if (optModal.style.display != "block") {
        var code = e.which;
        var chr = String.fromCharCode(code);
        if (code == 13) chr = "\r";  // enter key
        if (chr) {
            entryString += chr;
            handleEntry();
        }
    }
}

function handleEntry() {
    // handle key press changes to the entry string
    var key = keys[entryString.toLowerCase()];
    if (key && (state < mode.MEMSTOMODE || !(isNaN(Number(key.label))))) {
        entryString = "";
        key.execKey();
        updateDisplay();
        buttonDown(document.getElementById(key.label));
    } else if (!(partialKeys[entryString.toLowerCase()])) {
        entryString = entryString.slice(0, -1);
    } else if (state >= mode.MEMSTOMODE) {
        entryString = "";
    }
    document.getElementById("entrystring").innerHTML = entryString;
}

function saveSettings() {
    if (typeof(localStorage) !== "undefined") {
        localStorage.angleunit = angleUnit;
        localStorage.decplaces = decPlaces;
        localStorage.scinotation = sciNotation;
        localStorage.showreg = showReg;
        localStorage.storestack = storeStack;
        localStorage.memory = memory.toString();
    }
}

function saveStack() {
    if (storeStack && typeof(localStorage) !== "undefined") {
        localStorage.stack = stack.values.toString();
    }
}

function restoreSettings() {
    if (typeof(localStorage) !== "undefined") {
        var ang = localStorage.angleunit;
        if (["deg", "rad", "grad"].indexOf(ang) >= 0) {
            angleUnit = ang;
        }
        var dec = parseInt(localStorage.decplaces);
        if (dec >= 0 && dec <= 9) {
            decPlaces = dec;
        }
        if (localStorage.scinotation == "true") {
            sciNotation = true;
        }
        if (localStorage.showreg == "false") {
            showReg = false;
        }
        if (localStorage.storestack == "false") {
            storeStack = false;
        }
        var mem = localStorage.memory;
        if (mem != null) {
            mem = mem.split(",");
            if (mem.length == 10) {
                mem = mem.map(Number);
                if (!mem.some(isNaN)) {
                    memory = mem;
                }
            }
        }
    }
}

function restoreStack() {
    if (storeStack && typeof(localStorage) !== "undefined") {
        var stackVal = localStorage.stack;
        if (stackVal != null) {
            stackVal = stackVal.split(",");
            if (stackVal.length == 4) {
                stackVal = stackVal.map(Number);
                if (!stackVal.some(isNaN)) {
                    stack.values = stackVal;
                    stack.updateXStr();
                }
            }
        }
    }
}
