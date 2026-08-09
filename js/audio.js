/* ============================================
   audio.js - Ambient sound generation
   Uses Web Audio API for all sounds (no files needed)
   ============================================ */

const AudioEngine = {
  ctx: null,
  masterGain: null,
  noiseNodes: [],
  musicNodes: [],
  isPlaying: false,
  currentSound: 'none',
  volume: 0.5,
  isMuted: false,

  init() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.disableControls('当前浏览器不支持 Web Audio');
      return;
    }
    try {
      this.ctx = new AudioContextClass();
    } catch (e) {
      this.disableControls('音频不可用');
      return;
    }
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);

    this.bindUI();
    this.loadSettings();
  },

  disableControls(message) {
    ['sound-select', 'btn-play-audio', 'btn-mute', 'volume-slider'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });
    const nowPlaying = document.getElementById('now-playing');
    if (nowPlaying) nowPlaying.textContent = message;
  },

  bindUI() {
    document.getElementById('sound-select').addEventListener('change', (e) => {
      this.selectSound(e.target.value);
    });
    document.getElementById('btn-play-audio').addEventListener('click', () => {
      this.togglePlay();
    });
    document.getElementById('btn-mute').addEventListener('click', () => {
      this.toggleMute();
    });
    document.getElementById('volume-slider').addEventListener('input', (e) => {
      this.setVolume(e.target.value / 100);
    });

    // Resume audio context on user interaction
    const resumeCtx = () => {
      if (this.ctx.state === 'suspended') this.ctx.resume();
    };
    document.addEventListener('click', resumeCtx, { once: true });
  },

  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('audioSettings'));
      if (s) {
        this.volume = s.volume ?? 0.5;
        this.isMuted = s.isMuted ?? false;
        this.currentSound = s.currentSound ?? 'none';
        document.getElementById('volume-slider').value = this.volume * 100;
        document.getElementById('volume-label').textContent = Math.round(this.volume * 100) + '%';
        document.getElementById('sound-select').value = this.currentSound;
        if (this.isMuted) {
          document.getElementById('btn-mute').textContent = '🔇';
        }
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
      }
    } catch(e) {}
  },

  saveSettings() {
    SafeStore.set('audioSettings', JSON.stringify({
      volume: this.volume,
      isMuted: this.isMuted,
      currentSound: this.currentSound,
    }));
  },

  async selectSound(sound) {
    if (!this.ctx) return;
    this.stopAll();
    this.currentSound = sound;
    this.saveSettings();

    const label = document.getElementById('sound-select').selectedOptions[0]?.text || '未播放';
    document.getElementById('now-playing').textContent = label;

    if (sound === 'none') {
      this.isPlaying = false;
      document.getElementById('btn-play-audio').textContent = '▶️';
      return;
    }

    // Small delay then play
    await this.ctx.resume();
    this.startSound(sound);
    this.isPlaying = true;
    document.getElementById('btn-play-audio').textContent = '⏸️';
  },

  togglePlay() {
    if (!this.ctx) return;
    if (this.currentSound === 'none') {
      // Default to rain if nothing selected
      document.getElementById('sound-select').value = 'rain';
      this.selectSound('rain');
      return;
    }
    if (this.isPlaying) {
      this.stopAll();
      this.isPlaying = false;
      document.getElementById('btn-play-audio').textContent = '▶️';
    } else {
      this.ctx.resume().then(() => {
        this.startSound(this.currentSound);
        this.isPlaying = true;
        document.getElementById('btn-play-audio').textContent = '⏸️';
      });
    }
  },

  toggleMute() {
    if (!this.ctx || !this.masterGain) return;
    this.isMuted = !this.isMuted;
    document.getElementById('btn-mute').textContent = this.isMuted ? '🔇' : '🔊';
    this.masterGain.gain.setTargetAtTime(
      this.isMuted ? 0 : this.volume,
      this.ctx.currentTime,
      0.1
    );
    this.saveSettings();
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    document.getElementById('volume-label').textContent = Math.round(v * 100) + '%';
    if (!this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    }
    this.saveSettings();
  },

  stopAll() {
    this.noiseNodes.forEach(n => {
      try { n.stop(); } catch(e) {}
      try { n.disconnect(); } catch(e) {}
    });
    this.noiseNodes = [];
    this.musicNodes.forEach(n => {
      try { n.stop(); } catch(e) {}
      try { n.disconnect(); } catch(e) {}
    });
    this.musicNodes = [];
  },

  startSound(sound) {
    if (!this.ctx) return;
    switch(sound) {
      case 'rain': this.createRain(); break;
      case 'cafe': this.createCafe(); break;
      case 'fireplace': this.createFireplace(); break;
      case 'ocean': this.createOcean(); break;
      case 'forest': this.createForest(); break;
      case 'wind': this.createWind(); break;
      case 'lofi1': this.createLofi1(); break;
      case 'lofi2': this.createLofi2(); break;
      case 'lofi3': this.createLofi3(); break;
    }
  },

  // Helper: create noise buffer
  createNoiseBuffer(duration = 4) {
    const size = this.ctx.sampleRate * duration;
    const buf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  },

  // Helper: create filtered noise source
  createFilteredNoise(type, freq, q = 1) {
    const buf = this.createNoiseBuffer();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start();
    this.noiseNodes.push(src);
    return { src, gain, filter };
  },

  // ---- White Noise Sounds ----

  createRain() {
    const { gain } = this.createFilteredNoise('highpass', 1000, 0.5);
    const { gain: g2 } = this.createFilteredNoise('bandpass', 3000, 0.3);
    gain.gain.setTargetAtTime(0.15, this.ctx.currentTime, 0.5);
    g2.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.5);

    // Occasional "drops"
    this.addRainDrops();
  },

  addRainDrops() {
    const interval = setInterval(() => {
      if (!this.isPlaying || this.currentSound !== 'rain') {
        clearInterval(interval);
        return;
      }
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 600 + Math.random() * 800;
      g.gain.setValueAtTime(0.03, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
      this.noiseNodes.push(osc);
    }, 400 + Math.random() * 600);
    this.noiseNodes.push({ stop: () => clearInterval(interval), disconnect: () => {} });
  },

  createCafe() {
    const { gain } = this.createFilteredNoise('lowpass', 800, 0.5);
    gain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.5);

    // Background murmur
    const murmurInterval = setInterval(() => {
      if (!this.isPlaying || this.currentSound !== 'cafe') {
        clearInterval(murmurInterval);
        return;
      }
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 150 + Math.random() * 200;
      g.gain.setValueAtTime(0.02, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.3);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
      this.noiseNodes.push(osc);
    }, 200);
    this.noiseNodes.push({ stop: () => clearInterval(murmurInterval), disconnect: () => {} });
  },

  createFireplace() {
    const { gain } = this.createFilteredNoise('lowpass', 400, 2);
    gain.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.5);

    // Crackles
    const crackleInterval = setInterval(() => {
      if (!this.isPlaying || this.currentSound !== 'fireplace') {
        clearInterval(crackleInterval);
        return;
      }
      const buf = this.createNoiseBuffer(0.05);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2000;
      g.gain.setValueAtTime(0.05 * Math.random(), this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.05);
      src.connect(f);
      f.connect(g);
      g.connect(this.masterGain);
      src.start();
      this.noiseNodes.push(src);
    }, 80 + Math.random() * 200);
    this.noiseNodes.push({ stop: () => clearInterval(crackleInterval), disconnect: () => {} });
  },

  createOcean() {
    const { gain, filter } = this.createFilteredNoise('lowpass', 600, 0.3);
    gain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 1);

    // Slow modulation for waves
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.noiseNodes.push(lfo);
  },

  createForest() {
    const { gain } = this.createFilteredNoise('bandpass', 2000, 0.5);
    gain.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.5);

    // Bird-like tones
    const birdNotes = [1200, 1400, 1600, 1800, 2000, 2400, 2800];
    const birdInterval = setInterval(() => {
      if (!this.isPlaying || this.currentSound !== 'forest') {
        clearInterval(birdInterval);
        return;
      }
      if (Math.random() > 0.3) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      const freq = birdNotes[Math.floor(Math.random() * birdNotes.length)];
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.setValueAtTime(freq * 1.1, this.ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.4);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.4);
      this.noiseNodes.push(osc);
    }, 2000 + Math.random() * 3000);
    this.noiseNodes.push({ stop: () => clearInterval(birdInterval), disconnect: () => {} });
  },

  createWind() {
    const { gain, filter } = this.createFilteredNoise('lowpass', 300, 1);
    gain.gain.setTargetAtTime(0.15, this.ctx.currentTime, 1);

    // Gust modulation
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.noiseNodes.push(lfo);
  },

  // ---- Music ----

  createLofi1() {
    this.playChordProgression([
      ['C4', 'E4', 'G4'],
      ['A3', 'C4', 'E4'],
      ['F3', 'A3', 'C4'],
      ['G3', 'B3', 'D4'],
    ], 0.04, 'sine');
  },

  createLofi2() {
    this.playChordProgression([
      ['D4', 'F#4', 'A4'],
      ['B3', 'D4', 'F#4'],
      ['G3', 'B3', 'D4'],
      ['A3', 'C#4', 'E4'],
    ], 0.03, 'triangle');
  },

  createLofi3() {
    this.playChordProgression([
      ['E3', 'G3', 'B3'],
      ['C3', 'E3', 'G3'],
      ['A2', 'C3', 'E3'],
      ['B2', 'D#3', 'F#3'],
    ], 0.05, 'sine');
  },

  noteToFreq(note) {
    const notes = { C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11 };
    const name = note.replace(/\d/, '');
    const octave = parseInt(note.match(/\d/)[0]);
    const semitone = notes[name];
    return 440 * Math.pow(2, (semitone - 9 + (octave - 4) * 12) / 12);
  },

  playChordProgression(chords, vol, waveform) {
    let time = this.ctx.currentTime;
    const chordDuration = 2.5;

    const playLoop = () => {
      if (!this.isPlaying || !this.currentSound.startsWith('lofi')) return;

      chords.forEach(chord => {
        chord.forEach(note => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = waveform;
          osc.frequency.value = this.noteToFreq(note);
          // Slight detune for warmth
          osc.detune.value = (Math.random() - 0.5) * 10;
          g.gain.setValueAtTime(0, time);
          g.gain.linearRampToValueAtTime(vol, time + 0.3);
          g.gain.setValueAtTime(vol, time + chordDuration - 0.3);
          g.gain.linearRampToValueAtTime(0, time + chordDuration);
          osc.connect(g);
          g.connect(this.masterGain);
          osc.start(time);
          osc.stop(time + chordDuration + 0.1);
          this.musicNodes.push(osc);
        });
        time += chordDuration;
      });

      // Schedule next loop
      const loopDelay = chords.length * chordDuration * 1000;
      const timer = setTimeout(() => playLoop(), loopDelay - 100);
      this.musicNodes.push({ stop: () => clearTimeout(timer), disconnect: () => {} });
    };

    playLoop();
  },
};
