//*******************************************************
// and here are the definitions of the sound operators
//*******************************************************
var OpSound = {
    lines: {},
    audioCtx: null,
    getAudioContext: function() {
        if (this.audioCtx) return this.audioCtx;
        if (!window.AudioContext && !window.webkitAudioContext) {
            console.warn('Web Audio API not supported in this browser');
        } else {
            this.audioCtx = new window.AudioContext() || new window.webkitAudioContext();
        }
        return this.audioCtx;
    },
    handleModifs: function(modif, modifType, defaultValue) {
        if (modif !== undefined) {
            let erg = evaluate(modif);
            if (erg.ctype === modifType) {
                if (erg.ctype === 'number') {
                    return erg.value.real;
                } else if (erg.ctype === 'list') {
                    let cslist = erg.value;
                    let jslist = [];
                    for (let i = 0; i < cslist.length; i++) {
                        jslist[i] = cslist[i].value.real;
                    }
                    return jslist;
                } else {
                    return erg.value;
                }
            }
        } else {
            return defaultValue;
        }
    },
    handleLineModif: function(modif, defaultValue) {
        if (modif !== undefined) {
            let erg = evaluate(modif);
            return niceprint(erg);
        }
        return defaultValue;
    },
    getBufferNode: function(arr) {
        let buf = new Float32Array(arr);
        let ctx = this.getAudioContext();
        let buffer = ctx.createBuffer(1, buf.length, ctx.sampleRate);
        buffer.copyToChannel(buf, 0);
        let bufferNode = ctx.createBufferSource();
        bufferNode.buffer = buffer;
        return bufferNode;
    }
};

evaluator.stopsound$0 = function() {
    OpSound.audioCtx.close();
    OpSound.audioCtx = null;
};

evaluator.playsin$1 = function(args, modifs) {
    let audioCtx = OpSound.getAudioContext();
    let freq = evaluate(args[0]).value.real;
    let line = OpSound.handleLineModif(modifs.line, "0");
    let amp = OpSound.handleModifs(modifs.amp, 'number', 0.5);
    let damp = OpSound.handleModifs(modifs.damp, 'number', 0);
    let duration = OpSound.handleModifs(modifs.duration, 'number', 1);
    let harmonics = OpSound.handleModifs(modifs.harmonics, 'list', [1]);
    let partials = OpSound.handleModifs(modifs.partials, 'list', [1]);
    let attack = OpSound.handleModifs(modifs.attack, 'number', 0.01);
    let release = OpSound.handleModifs(modifs.release, 'number', 0.01);
    let restart = OpSound.handleModifs(modifs.restart, 'boolean', true);

    if (harmonics.length > partials.length) {
        partials = Array(harmonics.length).fill(1);
        console.log("Ignoring modifier partials, because the length of partials does not match the length of harmonics");
    }

    function playOscillator(curline, freq, gain) {
        let oscNode = audioCtx.createOscillator();
        oscNode.type = 'sine';
        oscNode.frequency.value = freq;
        let gainNode = audioCtx.createGain();
        gainNode.gain.value = 0;
        gainNode.connect(curline.masterGain);
        oscNode.connect(gainNode);
        gainNode.gain.linearRampToValueAtTime(gain, audioCtx.currentTime + attack);
        oscNode.start(0);
        oscNode.onended = function() {
            gainNode.disconnect();
        };
        if (duration >= 0) {
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime + duration + attack);
        }
        return {
            oscNode: oscNode,
            gainNode: gainNode
        };
    }

    if (!OpSound.lines[line] || OpSound.lines[line].lineType !== 'sin') { //initialize
        OpSound.lines[line] = {
            lineType: 'sin',
            oscNodes: [],
            masterGain: 0
        };
        let curline = OpSound.lines[line];
        curline.masterGain = audioCtx.createGain();
        curline.masterGain.gain.value = 0;
        for (let i = 0; i < harmonics.length; i++) {
            curline.oscNodes.push(playOscillator(curline, partials[i] * (i + 1) * freq, harmonics[i]));
        }
        curline.masterGain.connect(audioCtx.destination);
        curline.masterGain.gain.linearRampToValueAtTime(amp, audioCtx.currentTime + attack);
        if (damp > 0) {
            curline.masterGain.gain.setTargetAtTime(0.0, audioCtx.currentTime + attack, (1 / damp));
            for (let i = 0; i < harmonics.length; i++) {
                curline.oscNodes[i].oscNode.stop(audioCtx.currentTime + (6 / damp));
            }
        } else if (damp < 0) {
            curline.masterGain.gain.setTargetAtTime(1, audioCtx.currentTime + attack, (-damp));
        }
    } else { //update
        let curline = OpSound.lines[line];
        if (damp === 0) {
            if (duration === 0) { //users can call playsin(...,duration->0) to stop a tone
                curline.masterGain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + release);
                for (let i = 0; i < curline.oscNodes.length; i++) {
                    curline.oscNodes[i].oscNode.stop(audioCtx.currentTime + release); //helps
                }
                delete OpSound.lines[line];
            } else {
                for (let i = 0; i < harmonics.length; i++) {
                    curline.oscNodes[i].oscNode.frequency.setValueAtTime(partials[i] * (i + 1) * freq, audioCtx.currentTime);
                    curline.oscNodes[i].gainNode.gain.setValueAtTime(harmonics[i], audioCtx.currentTime);
                }
            }
        } else { //damp != 0
            if (restart) {
                curline.masterGain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + release);
                for (let i = 0; i < curline.oscNodes.length; i++) {
                    curline.oscNodes[i].oscNode.stop(audioCtx.currentTime + release); //helps & gain gets auto disconnected!
                }
                for (let i = 0; i < harmonics.length; i++) {
                    if (i < curline.oscNodes.length) {
                        curline.oscNodes[i] = playOscillator(curline, partials[i] * (i + 1) * freq, harmonics[i]);
                    } else {
                        curline.oscNodes.push(playOscillator(curline, partials[i] * (i + 1) * freq, harmonics[i]));
                    }
                }
                curline.masterGain.gain.linearRampToValueAtTime(amp, audioCtx.currentTime + release + attack);

                if (damp > 0) {
                    curline.masterGain.gain.setTargetAtTime(0.0, audioCtx.currentTime + release + attack, (1 / damp));
                } else if (damp < 0) {
                    curline.masterGain.gain.setTargetAtTime(1, audioCtx.currentTime + release + attack, (-damp));
                }
            } else { //restart -> false so just change damp & timbre
                for (let i = 0; i < harmonics.length; i++) {
                    curline.oscNodes[i].oscNode.frequency.value = partials[i] * (i + 1) * freq;
                    curline.oscNodes[i].gainNode.gain.value = harmonics[i];
                }
                if (damp > 0) {
                    curline.masterGain.gain.setTargetAtTime(0.0, audioCtx.currentTime, (1 / damp));
                } else if (damp < 0) {
                    curline.masterGain.gain.setTargetAtTime(1, audioCtx.currentTime, (-damp));
                }
            }
        }
    }
    return nada;
};


evaluator.playsin$0 = function(args, modifs) {
    let erg;
    if (modifs.line !== undefined) {
        let line = OpSound.handleLineModif(modifs.line, "0");
        evaluator.playsin$1([CSNumber.real(OpSound.lines[line].oscNodes[0].oscNode.frequency.value)], modifs);
    }
    return nada;
};


evaluator.playfunction$1 = function(args, modifs) {
    let audioCtx = OpSound.getAudioContext();

    function searchVar(tree) {
        let stack = [];
        stack.push(tree);
        while (stack.length !== 0) { //DFS with handwritten stack.
            let v = stack.pop();
            if (v.ctype === "variable" && evaluate(v) === nada) {
                if (["x", "y", "t"].includes(v.name))
                    return v.name;
            }
            if (v.args) {
                for (let i in v.args) {
                    stack.push(v.args[i]);
                }
            }
        }
        return nada;
    }

    let v0 = args[0];

    let runv = searchVar(v0);
    if (runv !== nada) {
        namespace.newvar(runv);
    }

    let freq = evaluate(args[0]).value.real;
    let line = OpSound.handleLineModif(modifs.line, "0");
    let start = OpSound.handleModifs(modifs.start, 'number', 0);
    let amp = OpSound.handleModifs(modifs.amp, 'number', 0.5);
    let damp = OpSound.handleModifs(modifs.damp, 'number', 0);
    let duration = OpSound.handleModifs(modifs.duration, 'number', 1);
    let attack = OpSound.handleModifs(modifs.attack, 'number', 0.01);
    let release = OpSound.handleModifs(modifs.release, 'number', 0.01);
    let exprt = OpSound.handleModifs(modifs.export, 'boolean', false);
    let silent;

    let wave = [];

    for (let i = 0; i < audioCtx.sampleRate * duration; i++) {
        if (runv !== nada) {
            namespace.setvar(runv, CSNumber.real(i / audioCtx.sampleRate));
        }
        let erg = evaluate(v0);
        wave[i] = erg.value.real * amp * Math.exp(-damp * i / audioCtx.sampleRate);
    }

    if (!silent) {
        if (!OpSound.lines[line] || OpSound.lines[line].lineType !== 'function') { //initialize
            OpSound.lines[line] = {
                lineType: 'function',
                bufferNode: OpSound.getBufferNode(wave),
                masterGain: audioCtx.createGain()
            };
            let curline = OpSound.lines[line];
            curline.masterGain.gain.value = 0;
            curline.masterGain.connect(audioCtx.destination);
            curline.bufferNode.connect(curline.masterGain);
            curline.bufferNode.start(start);
            curline.masterGain.gain.linearRampToValueAtTime(amp, audioCtx.currentTime + attack);
        } else {
            let curline = OpSound.lines[line];
            curline.masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + release);
            curline.bufferNode.stop(audioCtx.currentTime + release);
            curline.bufferNode = OpSound.getBufferNode(wave);
            curline.bufferNode.connect(curline.masterGain);
            curline.bufferNode.start(start + release);
            curline.masterGain.gain.linearRampToValueAtTime(amp, audioCtx.currentTime + release + attack);
        }
    }

    if (runv !== nada) {
        namespace.removevar(runv);
    }
    if (exprt) {
        return wave;
    }
    return nada;
};


evaluator.playwave$1 = function(args, modifs) {
    let audioCtx = OpSound.getAudioContext();

    let wave = evaluate(args[0]);
    let line = OpSound.handleLineModif(modifs.line, "0");
    let amp = OpSound.handleModifs(modifs.amp, 'number', 0.5);
    let damp = OpSound.handleModifs(modifs.damp, 'number', 0);
    let duration = OpSound.handleModifs(modifs.duration, 'number', 1);
    let attack = OpSound.handleModifs(modifs.attack, 'number', 0.01);
    let release = OpSound.handleModifs(modifs.release, 'number', 0.01);

    if (wave.ctype !== 'list') {
        return nada;
    }

    //change output of playfunction to CindyList?

    if (!OpSound.lines[line] || OpSound.lines[line].lineType !== 'wave') { //initialize
        OpSound.lines[line] = {
            lineType: 'wave',
            bufferNode: OpSound.getBufferNode(General.unwrap(wave)),
            masterGain: audioCtx.createGain()
        };
        let curline = OpSound.lines[line];
        curline.masterGain.gain.value = 0;
        curline.masterGain.connect(audioCtx.destination);
        curline.bufferNode.connect(curline.masterGain);
        curline.bufferNode.start(0);
        curline.masterGain.gain.linearRampToValueAtTime(amp, audioCtx.currentTime + attack);
    } else {
        let curline = OpSound.lines[line];
        curline.masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + release);
        curline.bufferNode.stop(audioCtx.currentTime + release);
        curline.bufferNode = OpSound.getBufferNode(General.unwrap(wave));
        curline.bufferNode.connect(curline.masterGain);
        curline.bufferNode.start(start + release);
        curline.masterGain.gain.linearRampToValueAtTime(amp, audioCtx.currentTime + release + attack);
    }

    return nada;
};
