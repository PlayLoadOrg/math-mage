import React, { useState, useEffect, useCallback, useRef } from 'react';

// Game balance constants
const GAME_CONFIG = {
  GRID_SIZE: 15, VIEWPORT_SIZE: 9, GRID_CENTER: 7,
  TUTORIAL_HP: 300, TUTORIAL_AP: 6, TUTORIAL_DAMAGE: 40, TUTORIAL_LEVEL: 10,
  PLAYER_START_HP: 100, PLAYER_START_AP: 4, PLAYER_START_DAMAGE: 15,
  ENEMY_START_HP: 30, ENEMY_START_DAMAGE: 8, ENEMY_AP: 2,
  TUTORIAL_ENEMY_COUNT: 3, MAIN_ENEMY_COUNT: 10,
  SKILL_START_LEVEL: 1, XP_PER_ENEMY: 25, XP_TO_LEVEL: 100,
  MELEE_RANGE: 1, RANGED_MIN_RANGE: 2, RANGED_MAX_RANGE: 3,
  AP_COST_MOVE: 1, AP_COST_MELEE: 1, AP_COST_RANGED: 2, AP_COST_SHIELD: 2,
  TURN_TIME_LIMIT: 60, SHIELD_REDUCTION: 0.5, CRYSTALS_NEEDED: 3,
};

const TILE_TYPES = { FLOOR: '⬛', WALL: '🧱', PILLAR: '🗿', TORCH: '🔥' };

const manhattanDistance = (pos1, pos2) => Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
const gridToCoords = (gridX, gridY) => ({ x: gridX - GAME_CONFIG.GRID_CENTER, y: GAME_CONFIG.GRID_CENTER - gridY });
const coordsToGrid = (coordX, coordY) => ({ x: coordX + GAME_CONFIG.GRID_CENTER, y: GAME_CONFIG.GRID_CENTER - coordY });
const calculateCentroid = (p1, p2, p3) => ({ x: Math.round((p1.x + p2.x + p3.x) / 3), y: Math.round((p1.y + p2.y + p3.y) / 3) });

const generateEquation = (target, skillLevel, actionType) => {
  const complexity = Math.min(skillLevel, 10);
  if (actionType === 'move') {
    const a = Math.floor(Math.random() * (5 + complexity)) + 1;
    const operation = Math.random() > 0.5 ? '+' : '-';
    const b = operation === '+' ? target - a : a - target;
    if (b > 0 && b <= 20) return `${a}${operation}${b}`;
    return `${target}+0`;
  } else if (actionType === 'melee') {
    const a = Math.floor(Math.random() * (8 + complexity)) + target;
    const b = Math.floor(Math.random() * (5 + complexity)) + 1;
    const c = a + b - target;
    if (c > 0 && c <= 30) return `${a}+${b}-${c}`;
    return `${target}+1-1`;
  } else if (actionType === 'ranged') {
    const divisor = Math.floor(Math.random() * (3 + Math.floor(complexity / 2))) + 2;
    const product = target * divisor;
    if (product <= 50) return `${product}÷${divisor}`;
    const a = Math.floor(Math.random() * 4) + 2;
    const b = Math.floor(Math.random() * 3) + 1;
    const c = a * b / target;
    if (Number.isInteger(c) && c > 0) return `${a}×${b}÷${c}`;
    return `${target * 2}÷2`;
  } else if (actionType === 'shield') {
    const a = Math.floor(Math.random() * (4 + Math.floor(complexity / 2))) + 2;
    const b = Math.floor(target / a);
    if (a * b === target) return `${a}×${b}`;
    return `${target}×1`;
  }
  return `${target}`;
};

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const generateDungeonTile = (x, y, gridSize) => {
  const isEdge = x === 0 || y === 0 || x === gridSize - 1 || y === gridSize - 1;
  if (isEdge && Math.random() > 0.7) return TILE_TYPES.WALL;
  if (Math.random() > 0.97) return TILE_TYPES.PILLAR;
  if (Math.random() > 0.985) return TILE_TYPES.TORCH;
  return TILE_TYPES.FLOOR;
};

export default function MathMage() {
  const audioContextRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [textSize, setTextSize] = useState('normal');

  const initAudio = () => { if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)(); };
  const playSound = (type) => {
    if (!soundEnabled) return;
    try {
      initAudio();
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const sounds = {
        move: [200, 150, 0.1, 0.1], melee: [150, 80, 0.15, 0.15], ranged: [400, 800, 0.12, 0.2],
        shield: [300, 300, 0.1, 0.3], hit: [100, 50, 0.2, 0.1], death: [200, 50, 0.15, 0.5],
        crystal: [800, 1200, 0.1, 0.3], victory: [523, 784, 0.15, 0.6]
      };
      const [f1, f2, g, dur] = sounds[type] || [200, 200, 0.1, 0.1];
      osc.frequency.setValueAtTime(f1, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + dur);
      gain.gain.setValueAtTime(g, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  };
  
  const [gameState, setGameState] = useState('tutorial');
  const [tutorialStep, setTutorialStep] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(GAME_CONFIG.TURN_TIME_LIMIT);
  const [hasShield, setHasShield] = useState(false);
  const [dungeonLevel, setDungeonLevel] = useState(1);
  const [crystalsCollected, setCrystalsCollected] = useState(0);
  const [crystalLocations, setCrystalLocations] = useState([]);
  const [currentObjective, setCurrentObjective] = useState(null);
  const [portalLocation, setPortalLocation] = useState(null);
  const [projectiles, setProjectiles] = useState([]);
  const [slashEffects, setSlashEffects] = useState([]);
  const [bumpEffects, setBumpEffects] = useState([]);
  const [particleEffects, setParticleEffects] = useState([]);
  const [dyingEnemies, setDyingEnemies] = useState([]);
  const [player, setPlayer] = useState({
    x: Math.floor(GAME_CONFIG.GRID_SIZE / 2), y: Math.floor(GAME_CONFIG.GRID_SIZE / 2),
    hp: GAME_CONFIG.TUTORIAL_HP, maxHp: GAME_CONFIG.TUTORIAL_HP,
    ap: GAME_CONFIG.TUTORIAL_AP, maxAp: GAME_CONFIG.TUTORIAL_AP,
    damage: GAME_CONFIG.TUTORIAL_DAMAGE, xp: 0, level: GAME_CONFIG.TUTORIAL_LEVEL,
    skills: { move: GAME_CONFIG.TUTORIAL_LEVEL, melee: GAME_CONFIG.TUTORIAL_LEVEL, ranged: GAME_CONFIG.TUTORIAL_LEVEL, shield: GAME_CONFIG.TUTORIAL_LEVEL }
  });
  const [enemies, setEnemies] = useState([]);
  const [currentActions, setCurrentActions] = useState([]);
  const [combatLog, setCombatLog] = useState([]);
  const [gamePhase, setGamePhase] = useState('player');
  const [dungeonTiles, setDungeonTiles] = useState({});
  
  const tutorialDialogue = [
    { speaker: "Archmage Pythagoras", text: "Young apprentice... the shadow legion has breached our sanctuary. We are trapped in this dungeon.", icon: "🧙‍♂️" },
    { speaker: "Archmage Pythagoras", text: "I must create a portal for you to escape through. By activating the three crystal orbs hidden in this dungeon, the location of the portal will be revealed.", icon: "🧙‍♂️" },
    { speaker: "Archmage Pythagoras", text: "These creatures can only be harmed through Arithmancy. Each action requires solving an equation. Watch carefully as I demonstrate.", icon: "🧙‍♂️" },
    { speaker: "Familiar (Python)", text: "Massster! You're using too much power! Your life force—!", icon: "🐍" },
    { speaker: "Archmage Pythagoras", text: "Silence, Python. The apprentice must learn. Remember: you have 60 seconds per turn. Use all your Action Points or lose them! The orbs will guide you through coordinates.", icon: "🧙‍♂️" },
  ];
  
  const addLog = useCallback((message) => {
    setCombatLog(prev => [...prev.slice(-4), { message, timestamp: Date.now() }]);
  }, []);
  
  useEffect(() => {
    const tiles = {};
    for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
      for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
        tiles[`${x},${y}`] = generateDungeonTile(x, y, GAME_CONFIG.GRID_SIZE);
      }
    }
    setDungeonTiles(tiles);
  }, []);
  
  useEffect(() => {
    const newEnemies = [];
    const centerX = Math.floor(GAME_CONFIG.GRID_SIZE / 2), centerY = Math.floor(GAME_CONFIG.GRID_SIZE / 2);
    const enemyCount = gameState === 'tutorial' ? GAME_CONFIG.TUTORIAL_ENEMY_COUNT : GAME_CONFIG.MAIN_ENEMY_COUNT;
    
    for (let i = 0; i < enemyCount; i++) {
      let x, y;
      do {
        x = Math.floor(Math.random() * GAME_CONFIG.GRID_SIZE);
        y = Math.floor(Math.random() * GAME_CONFIG.GRID_SIZE);
      } while ((x === centerX && y === centerY) || manhattanDistance({x, y}, {x: centerX, y: centerY}) < 4);
      newEnemies.push({ id: i, x, y, hp: GAME_CONFIG.ENEMY_START_HP, maxHp: GAME_CONFIG.ENEMY_START_HP, damage: GAME_CONFIG.ENEMY_START_DAMAGE, label: String.fromCharCode(65 + i) });
    }
    setEnemies(newEnemies);
    
    if (gameState === 'tutorial') {
      addLog('🧙‍♂️ Archmage Pythagoras demonstrates his power...');
    } else if (gameState === 'main') {
      const crystals = [];
      let validTriangle = false, attempts = 0;
      while (!validTriangle && attempts < 100) {
        crystals.length = 0;
        for (let i = 0; i < 3; i++) {
          let crystalX, crystalY, validPoint = false;
          while (!validPoint) {
            crystalX = Math.floor(Math.random() * GAME_CONFIG.GRID_SIZE);
            crystalY = Math.floor(Math.random() * GAME_CONFIG.GRID_SIZE);
            const farFromCenter = manhattanDistance({x: crystalX, y: crystalY}, {x: centerX, y: centerY}) >= 3;
            const notOccupied = !newEnemies.some(e => e.x === crystalX && e.y === crystalY);
            const notDuplicate = !crystals.some(c => c.x === crystalX && c.y === crystalY);
            const farFromOthers = crystals.length === 0 || crystals.every(c => manhattanDistance({x: crystalX, y: crystalY}, {x: c.x, y: c.y}) >= 3);
            if (farFromCenter && notOccupied && notDuplicate && farFromOthers) validPoint = true;
          }
          crystals.push({ x: crystalX, y: crystalY, id: i });
        }
        const [p1, p2, p3] = crystals;
        const dist12 = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        const dist23 = Math.sqrt(Math.pow(p2.x - p3.x, 2) + Math.pow(p2.y - p3.y, 2));
        const dist31 = Math.sqrt(Math.pow(p3.x - p1.x, 2) + Math.pow(p3.y - p1.y, 2));
        const distances = [dist12, dist23, dist31].sort((a, b) => a - b);
        const isPythagorean = Math.abs(Math.pow(distances[0], 2) + Math.pow(distances[1], 2) - Math.pow(distances[2], 2)) < 0.5;
        const legsLongEnough = distances[0] >= 7 && distances[1] >= 7;
        if (isPythagorean && legsLongEnough) validTriangle = true;
        attempts++;
      }
      setCrystalLocations(crystals);
      const firstCrystal = crystals[0], coords = gridToCoords(firstCrystal.x, firstCrystal.y);
      setCurrentObjective({ type: 'crystal', location: coords, message: `Find: (${coords.x}, ${coords.y})` });
      addLog('⚡ You awaken with newfound purpose. Find the crystal orbs!');
    }
  }, [gameState, addLog]);
  
  useEffect(() => {
    if (gamePhase === 'player' && gameState === 'main') {
      const timer = setInterval(() => setTimeRemaining(prev => prev <= 1 ? 0 : prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (gamePhase === 'enemy') {
      setTimeRemaining(GAME_CONFIG.TURN_TIME_LIMIT);
    }
  }, [gamePhase, gameState]);
  
  const generateActions = useCallback(() => {
    const actions = [];
    const directions = [
      { dx: 0, dy: -1, icon: '⬆️', label: 'North' },
      { dx: 0, dy: 1, icon: '⬇️', label: 'South' },
      { dx: -1, dy: 0, icon: '⬅️', label: 'West' },
      { dx: 1, dy: 0, icon: '➡️', label: 'East' },
    ];
    directions.forEach(dir => {
      const newX = player.x + dir.dx, newY = player.y + dir.dy;
      if (newX >= 0 && newX < GAME_CONFIG.GRID_SIZE && newY >= 0 && newY < GAME_CONFIG.GRID_SIZE && player.ap >= GAME_CONFIG.AP_COST_MOVE) {
        const occupied = enemies.some(e => e.x === newX && e.y === newY);
        if (!occupied) actions.push({ type: 'move', x: newX, y: newY, icon: dir.icon, label: dir.label, cost: GAME_CONFIG.AP_COST_MOVE });
      }
    });
    if (enemies.length > 0) {
      enemies.forEach(enemy => {
        const distance = manhattanDistance(player, enemy);
        if (distance === GAME_CONFIG.MELEE_RANGE && player.ap >= GAME_CONFIG.AP_COST_MELEE) {
          actions.push({ type: 'melee', target: enemy.id, icon: '⚔️', label: `Melee [${enemy.label}]`, enemyLabel: enemy.label, cost: GAME_CONFIG.AP_COST_MELEE });
        }
        if (distance >= GAME_CONFIG.RANGED_MIN_RANGE && distance <= GAME_CONFIG.RANGED_MAX_RANGE && player.ap >= GAME_CONFIG.AP_COST_RANGED) {
          actions.push({ type: 'ranged', target: enemy.id, icon: '🏹', label: `Ranged [${enemy.label}]`, enemyLabel: enemy.label, cost: GAME_CONFIG.AP_COST_RANGED });
        }
      });
    }
    if (player.ap >= GAME_CONFIG.AP_COST_SHIELD && !hasShield) {
      actions.push({ type: 'shield', icon: '🛡️', label: 'Protective Shield', cost: GAME_CONFIG.AP_COST_SHIELD });
    }
    actions.push({ type: 'endTurn', icon: '⏭️', label: 'End Turn', cost: 0 });
    const availableNumbers = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const actionsWithNumbers = actions.slice(0, 9).map((action, index) => {
      const number = availableNumbers[index];
      const skillLevel = action.type === 'move' ? player.skills.move : action.type === 'melee' ? player.skills.melee : action.type === 'ranged' ? player.skills.ranged : action.type === 'shield' ? player.skills.shield : 1;
      return { ...action, number, equation: action.type === 'endTurn' ? '' : generateEquation(number, skillLevel, action.type), showAnswer: gameState === 'tutorial' && tutorialStep >= tutorialDialogue.length };
    });
    setCurrentActions(actionsWithNumbers);
  }, [player, enemies, hasShield, gameState, tutorialStep]);
  
  useEffect(() => { if (gamePhase === 'player') generateActions(); }, [player.x, player.y, player.ap, enemies.length, gamePhase, hasShield, generateActions]);
  
  const executeAction = useCallback((actionNumber) => {
    if (gamePhase !== 'player') return;
    const action = currentActions.find(a => a.number === actionNumber);
    if (!action) return;
    
    if (action.type === 'move') {
      playSound('move');
      setPlayer(prev => ({ ...prev, x: action.x, y: action.y, ap: prev.ap - action.cost, skills: { ...prev.skills, move: prev.skills.move + 0.1 } }));
      addLog(`Moved ${action.label}`);
      if (gameState === 'main') {
        const crystal = crystalLocations.find(c => c.x === action.x && c.y === action.y);
        if (crystal && crystalsCollected < GAME_CONFIG.CRYSTALS_NEEDED) {
          playSound('crystal');
          const newCrystalsCollected = crystalsCollected + 1;
          setCrystalsCollected(newCrystalsCollected);
          addLog(`🔮 Crystal orb activated! (${newCrystalsCollected}/${GAME_CONFIG.CRYSTALS_NEEDED})`);
          if (newCrystalsCollected < GAME_CONFIG.CRYSTALS_NEEDED) {
            const nextCrystal = crystalLocations.find(c => !crystalLocations.slice(0, newCrystalsCollected).some(collected => collected.x === c.x && collected.y === c.y));
            if (nextCrystal) {
              const coords = gridToCoords(nextCrystal.x, nextCrystal.y);
              setCurrentObjective({ type: 'crystal', location: coords, message: `Find: (${coords.x}, ${coords.y})` });
            }
          } else {
            const centroid = calculateCentroid(crystalLocations[0], crystalLocations[1], crystalLocations[2]);
            let portalX = centroid.x, portalY = centroid.y;
            const isCentroidValid = portalX >= 0 && portalX < GAME_CONFIG.GRID_SIZE && portalY >= 0 && portalY < GAME_CONFIG.GRID_SIZE && !(portalX === action.x && portalY === action.y) && !enemies.some(e => e.x === portalX && e.y === portalY);
            if (!isCentroidValid) {
              let found = false;
              for (let radius = 1; radius <= 3 && !found; radius++) {
                for (let dx = -radius; dx <= radius && !found; dx++) {
                  for (let dy = -radius; dy <= radius && !found; dy++) {
                    const testX = centroid.x + dx, testY = centroid.y + dy;
                    if (testX >= 0 && testX < GAME_CONFIG.GRID_SIZE && testY >= 0 && testY < GAME_CONFIG.GRID_SIZE && !(testX === action.x && testY === action.y) && !enemies.some(e => e.x === testX && e.y === testY)) {
                      portalX = testX; portalY = testY; found = true;
                    }
                  }
                }
              }
            }
            setPortalLocation({ x: portalX, y: portalY });
            const coords = gridToCoords(portalX, portalY);
            setCurrentObjective({ type: 'portal', location: coords, message: `Portal: (${coords.x}, ${coords.y})` });
            addLog(`✨ All crystals activated! Portal revealed!`);
          }
        }
        if (portalLocation && action.x === portalLocation.x && action.y === portalLocation.y) {
          playSound('victory');
          addLog('🌌 You step through the portal...');
          setTimeout(() => addLog(`✨ Level ${dungeonLevel} Complete!`), 1000);
        }
      }
    } else if (action.type === 'melee') {
      playSound('melee');
      const enemy = enemies.find(e => e.id === action.target);
      if (enemy) {
        const slashId = Date.now();
        setSlashEffects(prev => [...prev, { id: slashId, x: enemy.x, y: enemy.y }]);
        setTimeout(() => setSlashEffects(prev => prev.filter(s => s.id !== slashId)), 400);
        setBumpEffects(prev => [...prev, { id: enemy.id, x: enemy.x, y: enemy.y }]);
        setTimeout(() => setBumpEffects(prev => prev.filter(b => b.id !== enemy.id)), 300);
        playSound('hit');
        const newEnemies = enemies.map(e => {
          if (e.id === action.target) {
            const newHp = e.hp - player.damage;
            if (newHp <= 0) {
              playSound('death');
              addLog(`⚔️ Vanquished [${e.label}]!`);
              const particleId = Date.now();
              setParticleEffects(prev => [...prev, { id: particleId, x: e.x, y: e.y }]);
              setTimeout(() => setParticleEffects(prev => prev.filter(p => p.id !== particleId)), 800);
              setDyingEnemies(prev => [...prev, { ...e, hp: 0 }]);
              setTimeout(() => setDyingEnemies(prev => prev.filter(de => de.id !== e.id)), 500);
              setPlayer(prev => {
                const newXp = prev.xp + GAME_CONFIG.XP_PER_ENEMY, leveledUp = newXp >= GAME_CONFIG.XP_TO_LEVEL * prev.level;
                if (leveledUp) {
                  addLog(`📈 Level ${prev.level + 1}!`);
                  return { ...prev, xp: newXp, level: prev.level + 1, maxHp: prev.maxHp + 20, hp: prev.hp + 20, damage: prev.damage + 5, ap: prev.ap - action.cost, skills: { ...prev.skills, melee: prev.skills.melee + 0.2 } };
                }
                return { ...prev, xp: newXp, ap: prev.ap - action.cost, skills: { ...prev.skills, melee: prev.skills.melee + 0.2 } };
              });
              return null;
            }
            return { ...e, hp: newHp };
          }
          return e;
        }).filter(e => e !== null);
        setEnemies(newEnemies);
        setPlayer(prev => ({ ...prev, ap: prev.ap - action.cost, skills: { ...prev.skills, melee: prev.skills.melee + 0.2 } }));
        if (newEnemies.length === enemies.length) addLog(`⚔️ Hit [${action.enemyLabel}]!`);
        if (gameState === 'tutorial' && newEnemies.length === 0) setTimeout(() => { setGameState('transition'); setTutorialStep(tutorialDialogue.length); }, 1000);
      }
    } else if (action.type === 'ranged') {
      playSound('ranged');
      const enemy = enemies.find(e => e.id === action.target);
      if (enemy) {
        const projectileId = Date.now();
        setProjectiles(prev => [...prev, { id: projectileId, startX: player.x, startY: player.y, endX: enemy.x, endY: enemy.y }]);
        setTimeout(() => {
          setProjectiles(prev => prev.filter(p => p.id !== projectileId));
          setBumpEffects(prev => [...prev, { id: enemy.id, x: enemy.x, y: enemy.y }]);
          setTimeout(() => setBumpEffects(prev => prev.filter(b => b.id !== enemy.id)), 300);
          playSound('hit');
          const rangedDamage = Math.floor(player.damage * 0.8);
          const newEnemies = enemies.map(e => {
            if (e.id === action.target) {
              const newHp = e.hp - rangedDamage;
              if (newHp <= 0) {
                playSound('death');
                addLog(`🏹 Eliminated [${e.label}]!`);
                const particleId = Date.now();
                setParticleEffects(prev => [...prev, { id: particleId, x: e.x, y: e.y }]);
                setTimeout(() => setParticleEffects(prev => prev.filter(p => p.id !== particleId)), 800);
                setDyingEnemies(prev => [...prev, { ...e, hp: 0 }]);
                setTimeout(() => setDyingEnemies(prev => prev.filter(de => de.id !== e.id)), 500);
                setPlayer(prev => {
                  const newXp = prev.xp + GAME_CONFIG.XP_PER_ENEMY, leveledUp = newXp >= GAME_CONFIG.XP_TO_LEVEL * prev.level;
                  if (leveledUp) {
                    addLog(`📈 Level ${prev.level + 1}!`);
                    return { ...prev, xp: newXp, level: prev.level + 1, maxHp: prev.maxHp + 20, hp: prev.hp + 20, damage: prev.damage + 5, ap: prev.ap - action.cost, skills: { ...prev.skills, ranged: prev.skills.ranged + 0.2 } };
                  }
                  return { ...prev, xp: newXp, ap: prev.ap - action.cost, skills: { ...prev.skills, ranged: prev.skills.ranged + 0.2 } };
                });
                return null;
              }
              return { ...e, hp: newHp };
            }
            return e;
          }).filter(e => e !== null);
          setEnemies(newEnemies);
          setPlayer(prev => ({ ...prev, ap: prev.ap - action.cost, skills: { ...prev.skills, ranged: prev.skills.ranged + 0.2 } }));
          if (newEnemies.length === enemies.length) addLog(`🏹 Shot [${action.enemyLabel}]!`);
          if (gameState === 'tutorial' && newEnemies.length === 0) setTimeout(() => { setGameState('transition'); setTutorialStep(tutorialDialogue.length); }, 1000);
        }, 500);
      }
    } else if (action.type === 'shield') {
      playSound('shield');
      setHasShield(true);
      setPlayer(prev => ({ ...prev, ap: prev.ap - action.cost, skills: { ...prev.skills, shield: prev.skills.shield + 0.1 } }));
      addLog('🛡️ Shield active!');
    } else if (action.type === 'endTurn') {
      setPlayer(prev => ({ ...prev, ap: prev.maxAp }));
      setGamePhase('enemy');
      addLog('Enemies advance...');
    }
  }, [gamePhase, currentActions, player, enemies, gameState, crystalLocations, crystalsCollected, portalLocation, dungeonLevel, addLog]);
  
  useEffect(() => {
    if (timeRemaining === 0 && gamePhase === 'player' && gameState === 'main') {
      const endTurnAction = currentActions.find(a => a.type === 'endTurn');
      if (endTurnAction) executeAction(endTurnAction.number);
    }
  }, [timeRemaining, gamePhase, gameState, currentActions, executeAction]);
  
  useEffect(() => {
    if (gamePhase === 'enemy') {
      if (enemies.length === 0) { setGamePhase('player'); addLog('⚡ Your turn!'); return; }
      setTimeout(() => {
        let updatedEnemies = [...enemies], updatedPlayerHp = player.hp;
        updatedEnemies.forEach(enemy => {
          let remainingAp = GAME_CONFIG.ENEMY_AP;
          while (remainingAp > 0) {
            const distance = manhattanDistance(enemy, player);
            if (distance === 1) {
              let damage = enemy.damage;
              if (hasShield) { damage = Math.floor(damage * GAME_CONFIG.SHIELD_REDUCTION); addLog(`🛡️ Shield blocked!`); }
              updatedPlayerHp -= damage;
              addLog(`👹 Hit for ${damage}!`);
              remainingAp = 0;
            } else {
              const dx = player.x - enemy.x, dy = player.y - enemy.y;
              if (Math.abs(dx) > Math.abs(dy)) enemy.x += dx > 0 ? 1 : -1;
              else enemy.y += dy > 0 ? 1 : -1;
              remainingAp--;
            }
          }
        });
        setEnemies(updatedEnemies);
        setPlayer(prev => ({ ...prev, hp: updatedPlayerHp }));
        setHasShield(false);
        if (updatedPlayerHp <= 0) addLog('💀 Defeated!');
        else { setGamePhase('player'); addLog('⚡ Your turn!'); }
      }, 1000);
    }
  }, [gamePhase, enemies, player, hasShield, addLog]);
  
  useEffect(() => {
    const handleKeyPress = (e) => { const num = parseInt(e.key); if (num >= 1 && num <= 9) executeAction(num); };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [executeAction]);
  
  const viewportOffset = Math.floor(GAME_CONFIG.VIEWPORT_SIZE / 2);
  const viewportMinX = Math.max(0, player.x - viewportOffset);
  const viewportMinY = Math.max(0, player.y - viewportOffset);
  const moveActions = currentActions.filter(a => a.type === 'move');
  const attackActions = currentActions.filter(a => a.type === 'melee' || a.type === 'ranged');
  const shieldAction = currentActions.find(a => a.type === 'shield');
  const endTurnAction = currentActions.find(a => a.type === 'endTurn');
  
  const textScale = textSize === 'small' ? 0.85 : textSize === 'large' ? 1.2 : 1;

  if (gameState === 'tutorial' && tutorialStep < tutorialDialogue.length) {
    const dialogue = tutorialDialogue[tutorialStep];
    return (
      <div className="w-screen h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(165deg, #0a0e27 0%, #1a1438 40%, #2d1b4e 100%)', fontFamily: 'Georgia, serif' }}>
        <div className="max-w-sm w-full p-6 rounded-lg" style={{ background: 'linear-gradient(135deg, rgba(10, 14, 39, 0.95), rgba(26, 20, 56, 0.95))', border: '3px solid #d4af37', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)' }}>
          <div className="text-4xl text-center mb-4">{dialogue.icon}</div>
          <div className="text-base text-center mb-2" style={{ color: '#d4af37', fontSize: `${1.1 * textScale}rem` }}>{dialogue.speaker}</div>
          <div className="text-sm text-center mb-6 italic" style={{ color: '#f4e8d0', lineHeight: 1.6, fontSize: `${1 * textScale}rem` }}>{dialogue.text}</div>
          <button onClick={() => setTutorialStep(prev => prev + 1)} className="w-full py-3 rounded-lg text-sm font-bold cursor-pointer" style={{ background: 'linear-gradient(135deg, #8a2be2, #6a1bb2)', border: '2px solid #9370db', color: '#f4e8d0', boxShadow: '0 0 20px rgba(138, 43, 226, 0.5)', fontSize: `${textScale}rem` }}>
            {tutorialStep === tutorialDialogue.length - 1 ? 'Begin Training' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }
  
  if (gameState === 'transition') {
    return (
      <div className="w-screen h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(165deg, #0a0e27 0%, #1a1438 40%, #2d1b4e 100%)', fontFamily: 'Georgia, serif' }}>
        <div className="max-w-sm w-full p-6 rounded-lg text-center" style={{ background: 'linear-gradient(135deg, rgba(10, 14, 39, 0.95), rgba(26, 20, 56, 0.95))', border: '3px solid #d4af37', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)' }}>
          <div className="text-4xl mb-4">💀</div>
          <div className="text-base mb-2" style={{ color: '#ff6b6b', fontSize: `${1.1 * textScale}rem` }}>Archmage Pythagoras</div>
          <div className="text-sm mb-4 italic" style={{ color: '#f4e8d0', lineHeight: 1.6, fontSize: `${1 * textScale}rem` }}>"I've shown you the way... apprentice. My power fades, but yours... is just beginning."</div>
          <div className="text-xs mb-4" style={{ color: '#c9b896', lineHeight: 1.6, fontSize: `${0.9 * textScale}rem` }}>The Archmage collapses. The three crystal orbs begin to glow, awaiting your touch.</div>
          <button onClick={() => { setPlayer({ x: Math.floor(GAME_CONFIG.GRID_SIZE / 2), y: Math.floor(GAME_CONFIG.GRID_SIZE / 2), hp: GAME_CONFIG.PLAYER_START_HP, maxHp: GAME_CONFIG.PLAYER_START_HP, ap: GAME_CONFIG.PLAYER_START_AP, maxAp: GAME_CONFIG.PLAYER_START_AP, damage: GAME_CONFIG.PLAYER_START_DAMAGE, xp: 0, level: 1, skills: { move: GAME_CONFIG.SKILL_START_LEVEL, melee: GAME_CONFIG.SKILL_START_LEVEL, ranged: GAME_CONFIG.SKILL_START_LEVEL, shield: GAME_CONFIG.SKILL_START_LEVEL } }); setGameState('main'); setGamePhase('player'); setTimeRemaining(GAME_CONFIG.TURN_TIME_LIMIT); }} className="w-full py-3 rounded-lg text-sm font-bold cursor-pointer" style={{ background: 'linear-gradient(135deg, #dc2626, #991b1b)', border: '2px solid #ff6b6b', color: '#f4e8d0', boxShadow: '0 0 20px rgba(220, 38, 38, 0.5)', fontSize: `${textScale}rem` }}>
            ⚔️ Begin Your Quest
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col" style={{ background: 'radial-gradient(ellipse at center, #1a1438 0%, #0a0e27 50%, #050510 100%)', fontFamily: 'Georgia, serif', color: '#f4e8d0', fontSize: `${textScale}rem` }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.1); } }
        @keyframes bump { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        .ornate-border { border: 2px solid #d4af37; box-shadow: 0 0 15px rgba(212, 175, 55, 0.3), inset 0 0 10px rgba(10, 14, 39, 0.8); background: linear-gradient(135deg, rgba(10, 14, 39, 0.95) 0%, rgba(26, 20, 56, 0.95) 100%); }
      `}</style>

      {/* TOP: Game Grid (50vh) */}
      <div className="flex-1 relative flex flex-col" style={{ maxHeight: '50vh', minHeight: '50vh' }}>
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3 py-2 ornate-border border-b" style={{ minHeight: '45px' }}>
          <button onClick={() => { setMenuOpen(!menuOpen); setGamePhase(menuOpen ? 'player' : 'menu'); }} className="px-2 py-1 text-xl" style={{ background: 'rgba(212, 175, 55, 0.2)', border: '1px solid #d4af37', cursor: 'pointer' }}>☰</button>
          <div style={{ color: '#d4af37', fontWeight: 'bold', textShadow: '0 0 10px rgba(212, 175, 55, 0.8)', fontSize: '1.1rem' }}>Math Mage</div>
          <div style={{ color: gamePhase === 'player' ? '#d4af37' : '#9370db', fontWeight: 'bold', fontSize: '0.9rem' }}>
            {gamePhase === 'player' ? '⚡ Turn' : '⏳ Wait'}
          </div>
        </div>

        {/* Game Grid Container */}
        <div className="flex-1 flex items-center justify-center p-2 relative overflow-hidden">
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${GAME_CONFIG.VIEWPORT_SIZE}, minmax(0, 1fr))`, width: '100%', maxWidth: '100%', aspectRatio: '1/1', position: 'relative' }}>
            {Array.from({ length: GAME_CONFIG.VIEWPORT_SIZE }).map((_, row) => 
              Array.from({ length: GAME_CONFIG.VIEWPORT_SIZE }).map((_, col) => {
                const worldX = viewportMinX + col, worldY = viewportMinY + row;
                const tileKey = `${worldX},${worldY}`;
                const tile = dungeonTiles[tileKey] || TILE_TYPES.FLOOR;
                const isPlayer = worldX === player.x && worldY === player.y;
                const enemy = enemies.find(e => e.x === worldX && e.y === worldY);
                const moveAction = moveActions.find(a => a.x === worldX && a.y === worldY);
                const crystal = gameState === 'main' ? crystalLocations.find(c => c.x === worldX && c.y === worldY && c.id >= crystalsCollected) : null;
                const isPortal = gameState === 'main' && portalLocation ? (worldX === portalLocation.x && worldY === portalLocation.y) : false;
                return (
                  <div key={`${row}-${col}`} onClick={() => moveAction && executeAction(moveAction.number)} className="flex items-center justify-center rounded relative" style={{ background: isPlayer ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.3), rgba(138, 43, 226, 0.2))' : 'rgba(10, 14, 39, 0.6)', border: '1px solid rgba(212, 175, 55, 0.25)', cursor: moveAction ? 'pointer' : 'default', aspectRatio: '1/1', boxShadow: isPlayer ? '0 0 15px rgba(212, 175, 55, 0.4)' : 'none', fontSize: 'clamp(16px, 5vw, 24px)' }}>
                    {!isPlayer && !enemy && !moveAction && tile !== TILE_TYPES.FLOOR && <span style={{ opacity: 0.3 }}>{tile}</span>}
                    {crystal && !isPlayer && !enemy && !moveAction && <span style={{ textShadow: '0 0 15px rgba(167, 139, 250, 0.8)', animation: 'pulse 2s ease-in-out infinite' }}>🔮</span>}
                    {isPortal && !isPlayer && !enemy && !moveAction && <span style={{ textShadow: '0 0 20px rgba(59, 130, 246, 1)', animation: 'pulse 1.5s ease-in-out infinite' }}>🌌</span>}
                    {isPlayer && <span style={{ textShadow: '0 0 10px rgba(167, 139, 250, 1)' }}>🧙</span>}
                    {enemy && (
                      <div className="relative">
                        <span style={{ textShadow: '0 0 10px rgba(239, 68, 68, 0.8)', animation: bumpEffects.some(b => b.id === enemy.id) ? 'bump 0.3s ease-out' : 'none' }}>
                          {dyingEnemies.some(de => de.id === enemy.id) ? '💀' : '👹'}
                        </span>
                      </div>
                    )}
                    {moveAction && !isPlayer && !enemy && (
                      <div className="flex flex-col items-center text-center" style={{ fontSize: 'clamp(10px, 3vw, 14px)' }}>
                        <span>{moveAction.icon}</span>
                        <span style={{ color: '#10b981', fontWeight: 'bold' }}>{moveAction.equation}{moveAction.showAnswer ? `=${moveAction.number}` : '=?'}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {projectiles.map((projectile) => {
              const startCol = projectile.startX - viewportMinX;
              const startRow = projectile.startY - viewportMinY;
              const endCol = projectile.endX - viewportMinX;
              const endRow = projectile.endY - viewportMinY;
              const keyframeName = `fireball-${projectile.id}`;
              
              return (
                <React.Fragment key={projectile.id}>
                  <style>{`
                    @keyframes ${keyframeName} {
                      0% { 
                        left: ${((startCol + 0.5) / GAME_CONFIG.VIEWPORT_SIZE) * 100}%;
                        top: ${((startRow + 0.5) / GAME_CONFIG.VIEWPORT_SIZE) * 100}%;
                        opacity: 1;
                        filter: drop-shadow(0 0 8px rgba(255, 100, 0, 0.8));
                        transform: scale(0.8);
                      }
                      100% { 
                        left: ${((endCol + 0.5) / GAME_CONFIG.VIEWPORT_SIZE) * 100}%;
                        top: ${((endRow + 0.5) / GAME_CONFIG.VIEWPORT_SIZE) * 100}%;
                        opacity: 0.9;
                        filter: drop-shadow(0 0 12px rgba(255, 100, 0, 0.9));
                        transform: scale(1);
                      }
                    }
                  `}</style>
                  <div style={{
                    position: 'absolute',
                    left: `${((startCol + 0.5) / GAME_CONFIG.VIEWPORT_SIZE) * 100}%`,
                    top: `${((startRow + 0.5) / GAME_CONFIG.VIEWPORT_SIZE) * 100}%`,
                    animation: `${keyframeName} 0.5s ease-in-out forwards`,
                    fontSize: 'clamp(16px, 5vw, 20px)',
                    transformOrigin: 'center center',
                    zIndex: 50
                  }}>
                    🔥
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* BOTTOM: Controls (50vh) */}
      <div className="flex-1 flex flex-col" style={{ maxHeight: '50vh', minHeight: '50vh', overflowY: 'auto' }}>
        {/* Quick Stats */}
        <div className="flex justify-between items-center px-3 py-2 text-xs ornate-border border-t border-b" style={{ gap: '0.5rem' }}>
          <div style={{ color: '#ff6b6b' }}>HP: {player.hp}/{player.maxHp}</div>
          <div style={{ color: '#60a5fa' }}>AP: {player.ap}/{player.maxAp}</div>
          {gameState === 'main' && <div style={{ color: '#ffd700' }}>⏱️ {timeRemaining}s</div>}
          <div style={{ color: '#d4af37' }}>Lvl {player.level}</div>
          {hasShield && <div style={{ color: '#60a5fa' }}>🛡️ Shield</div>}
        </div>

        {/* Objective (main only) */}
        {gameState === 'main' && currentObjective && (
          <div className="px-3 py-2 text-xs border-b" style={{ background: 'rgba(138, 43, 226, 0.15)', borderColor: 'rgba(138, 43, 226, 0.3)', color: '#c9b896' }}>
            {currentObjective.message}
          </div>
        )}

        {/* Attack Options */}
        {attackActions.length > 0 && (
          <div className="px-3 py-1 text-xs space-y-1 border-b" style={{ maxHeight: '50px', overflowY: 'auto' }}>
            {attackActions.map(action => (
              <div key={action.number} className="p-1 rounded" style={{ background: gamePhase === 'player' ? 'rgba(220, 38, 38, 0.2)' : 'rgba(60, 60, 80, 0.2)', border: gamePhase === 'player' ? '1px solid #ff6b6b' : '1px solid rgba(100, 100, 120, 0.3)', color: gamePhase === 'player' ? '#fff' : '#888', cursor: 'default' }}>
                <span>{action.icon} {action.equation}{action.showAnswer ? ` = ${action.number}` : ''}</span>
              </div>
            ))}
            {shieldAction && (
              <div className="p-1 rounded" style={{ background: gamePhase === 'player' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(60, 60, 80, 0.2)', border: gamePhase === 'player' ? '1px solid #60a5fa' : '1px solid rgba(100, 100, 120, 0.3)', color: gamePhase === 'player' ? '#fff' : '#888', cursor: 'default' }}>
                <span>{shieldAction.icon} {shieldAction.equation}{shieldAction.showAnswer ? ` = ${shieldAction.number}` : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* Numpad */}
        <div className="flex-1 flex flex-col px-3 py-2 gap-1">
          <div className="grid grid-cols-3 gap-1 flex-1">
            {[7, 8, 9, 4, 5, 6, 1, 2, 3].map(num => {
              const action = currentActions.find(a => a.number === num);
              const hasAction = !!action;
              return (
                <button key={num} onClick={() => executeAction(num)} disabled={!hasAction || gamePhase !== 'player'} className="rounded font-bold flex items-center justify-center" style={{ background: hasAction && gamePhase === 'player' ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.4), rgba(138, 43, 226, 0.4))' : 'rgba(40, 40, 60, 0.3)', border: hasAction ? '2px solid #d4af37' : '1px solid rgba(100, 100, 120, 0.3)', color: hasAction ? '#f4e8d0' : '#666', cursor: hasAction && gamePhase === 'player' ? 'pointer' : 'not-allowed', boxShadow: hasAction ? '0 0 10px rgba(212, 175, 55, 0.3)' : 'none', fontSize: '1.2rem' }}>{num}</button>
              );
            })}
          </div>
          {endTurnAction && (
            <button onClick={() => executeAction(endTurnAction.number)} disabled={gamePhase !== 'player'} className="w-full py-2 rounded font-bold text-xs" style={{ background: gamePhase === 'player' ? 'linear-gradient(135deg, #8a2be2, #6a1bb2)' : 'rgba(60, 60, 80, 0.4)', border: gamePhase === 'player' ? '2px solid #9370db' : '1px solid rgba(100, 100, 120, 0.3)', color: gamePhase === 'player' ? '#f4e8d0' : '#888', cursor: gamePhase === 'player' ? 'pointer' : 'not-allowed', boxShadow: gamePhase === 'player' ? '0 0 15px rgba(138, 43, 226, 0.4)' : 'none' }}>
              ⏭️ End Turn [{endTurnAction.number}]
            </button>
          )}
        </div>

        {/* Combat Log */}
        <div className="px-3 py-1 text-xs border-t ornate-border" style={{ maxHeight: '50px', overflowY: 'auto' }}>
          {combatLog.map((log, i) => <div key={log.timestamp} className="mb-0.5" style={{ color: '#c9b896' }}>{log.message}</div>)}
        </div>
      </div>

      {/* Menu Modal */}
      {menuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-end z-50">
          <div className="w-full bg-gradient-to-t from-gray-900 to-gray-800 p-4 rounded-t-2xl" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold" style={{ color: '#d4af37' }}>Menu</h2>
            </div>
            <div className="space-y-2">
              <button onClick={() => setSoundEnabled(!soundEnabled)} className="w-full px-4 py-2 rounded text-sm font-bold" style={{ background: soundEnabled ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 32, 64, 0.2)', border: `1px solid ${soundEnabled ? '#10b981' : '#ff2040'}`, color: soundEnabled ? '#10b981' : '#ff2040', cursor: 'pointer' }}>
                {soundEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF'}
              </button>
              <div className="px-4 py-2 rounded text-sm" style={{ background: 'rgba(60, 60, 80, 0.3)' }}>
                <div style={{ color: '#d4af37', marginBottom: '0.5rem' }}>Text Size</div>
                <div className="flex gap-2">
                  {['small', 'normal', 'large'].map(size => (
                    <button key={size} onClick={() => setTextSize(size)} className="flex-1 px-2 py-1 rounded text-xs font-bold" style={{ background: textSize === size ? 'rgba(212, 175, 55, 0.4)' : 'rgba(60, 60, 80, 0.4)', border: textSize === size ? '1px solid #d4af37' : '1px solid rgba(100, 100, 120, 0.3)', color: textSize === size ? '#d4af37' : '#888', cursor: 'pointer' }}>
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => { setMenuOpen(false); setGamePhase('player'); }} className="w-full px-4 py-2 rounded text-sm font-bold" style={{ background: 'linear-gradient(135deg, #8a2be2, #6a1bb2)', border: '2px solid #9370db', color: '#f4e8d0', cursor: 'pointer' }}>
                Resume Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}