/* Every sound the game uses, in one place.
 *
 * To add a real sound, replace its WAV in assets/sounds/ (music: assets/music/levels/) and keep the file name. No code changes.
 * The silent placeholders are detected when loaded, so a real file starts working by itself.
 *
 * gain: relative volume. bus: which setting controls it (sfx, music, voice). loop: repeats.
 */
const SOUND_LIST = {
  // In the game now
  whoosh:      { file: "jungle_basket_whoosh",   gain: 1.6 },
  pop:         { file: "jungle_counting_pop",    gain: 0.6 },
  tap:         { file: "jungle_tile_tap",        gain: 0.8 },
  correct:     { file: "jungle_correct_marimba", gain: 1.3 },
  tryAgain:    { file: "jungle_try_again",       gain: 1.0 },
  banana:      { file: "jungle_banana_collected", gain: 0.6 },

  crateThud:   { file: "jungle_crate_lid_thud",  gain: 1.2 },

  // One seamless loop per level, cut by tools/cut_music.py. The last level's loop continues
  // for any level after it. The volume is shared, so the track's natural build-up stays.

  // Silent placeholders for now
  levelUp:     { file: "jungle_level_complete",  gain: 1.0 },
  monkeyHappy: { file: "jungle_monkey_happy",    gain: 0.9 },
  monkeyHmm:   { file: "jungle_monkey_curious",  gain: 0.9 },
  ambience:    { file: "jungle_ambience_loop",   gain: 0.3, bus: "music", loop: true },
  toucan:      { file: "jungle_toucan_squawk",   gain: 0.9 },
  button:      { file: "jungle_button_tap",      gain: 0.8 },

  // Voice: silent until the real recordings are added
  plus:        { file: "voice_plus",      bus: "voice" },
  equals:      { file: "voice_equals",    bus: "voice" },
  greatJob:    { file: "voice_great_job", bus: "voice" },
  tryAgainVo:  { file: "voice_try_again", bus: "voice" },
};
for (let level = 1; level <= 13; level++) {
  SOUND_LIST[`music${level}`] = {
    file: `music_level_${String(level).padStart(2, "0")}`, dir: "music/levels",
    gain: 0.216, bus: "music", loop: true, track: true,
  };
}
for (let n = 0; n <= 20; n++) SOUND_LIST[`n${n}`] = { file: `voice_${n}`, bus: "voice" };

const Sound = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = AC ? new AC() : null;
  const settings = { sfx: true, music: true, voice: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem("jm-audio") || "{}")); } catch {}
  const buses = {};
  const buffers = {};   // name -> AudioBuffer, real sounds only
  const looping = {};   // name -> playing source
  const loaded = {};    // name -> promise
  const LOOPS = Object.keys(SOUND_LIST).filter((n) => SOUND_LIST[n].loop && !SOUND_LIST[n].track);
  const TRACKS = Object.keys(SOUND_LIST).filter((n) => SOUND_LIST[n].track);
  let wantedTrack = null, playingTrack = null;
  let wantLoops = false;

  if (ctx) for (const b of Object.keys(settings)) {
    buses[b] = ctx.createGain();
    buses[b].gain.value = settings[b] ? 1 : 0;
    buses[b].connect(ctx.destination);
  }

  const isSilent = (buf) => {
    for (let c = 0; c < buf.numberOfChannels; c++) {
      if (buf.getChannelData(c).some((v) => Math.abs(v) > 1e-4)) return false;
    }
    return true;
  };

  function load(name) {
    return (loaded[name] ||= (async () => {
      if (!ctx) return;
      try {
        const res = await fetch(`assets/${SOUND_LIST[name].dir || "sounds"}/${SOUND_LIST[name].file}.wav`);
        if (!res.ok) return;
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        if (!isSilent(buf)) buffers[name] = buf;
        if (wantLoops && LOOPS.includes(name)) startLoop(name);
      } catch (err) { console.warn("Could not load sound", name, err); }
    })());
  }

  function source(name, rate = 1) {
    const s = SOUND_LIST[name];
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffers[name];
    src.playbackRate.value = rate;
    src.loop = !!s.loop;
    gain.gain.value = s.gain ?? 1;
    src.volume = gain;
    src.connect(gain).connect(buses[s.bus || "sfx"]);
    return src;
  }

  function play(name, { rate = 1, delay = 0 } = {}) {
    if (!buffers[name]) return;
    source(name, rate).start(ctx.currentTime + delay);
  }

  function startLoop(name) {
    if (!buffers[name] || looping[name]) return;
    looping[name] = source(name);
    looping[name].start();
  }

  // Crossfades to the level's track. Tracks load only when needed, since they are large.
  async function setMusic(level) {
    const name = TRACKS[Math.min(level, TRACKS.length) - 1];
    if (!ctx || wantedTrack === name) return;
    wantedTrack = name;
    await load(name);
    if (wantedTrack !== name || !buffers[name]) return;
    const now = ctx.currentTime;
    if (playingTrack) {
      playingTrack.volume.gain.setTargetAtTime(0, now, 0.25);
      playingTrack.stop(now + 1.5);
    }
    playingTrack = source(name);
    playingTrack.volume.gain.setValueAtTime(0, now);
    playingTrack.volume.gain.linearRampToValueAtTime(SOUND_LIST[name].gain, now + 1);
    playingTrack.start();
  }

  // Plays recorded voice clips in order, and stays silent unless all of them exist.
  function say(clips) {
    if (!ctx || !clips.every((c) => buffers[c])) return;
    let at = 0;
    for (const c of clips) { play(c, { delay: at }); at += buffers[c].duration + 0.06; }
  }

  return {
    settings, play, say, setMusic,
    get track() { return playingTrack && wantedTrack; },
    preload() { Object.keys(SOUND_LIST).filter((n) => !TRACKS.includes(n)).forEach(load); },
    // Must run from a tap: iPads keep audio locked until then.
    unlock() {
      ctx?.resume();
      wantLoops = true;
      LOOPS.forEach(startLoop);
    },
    suspend() { ctx?.suspend(); },
    resume() { ctx?.resume(); },
    toggle(bus) {
      settings[bus] = !settings[bus];
      if (buses[bus]) buses[bus].gain.value = settings[bus] ? 1 : 0;
      try { localStorage.setItem("jm-audio", JSON.stringify(settings)); } catch {}
    },
  };
})();
