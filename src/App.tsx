import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Square, Volume2, FileAudio, ChevronLeft, ChevronRight, BookOpen, Globe, Settings, Move } from 'lucide-react';

// --- Types for Book Format ---

type TextOverlay = {
  id: string;
  content: string;
  position: { top: number, left: number, width: number }; // Percentages
  style?: React.CSSProperties;
};

type PageDef = 
  | { type: 'text', content: string }
  | { type: 'image', url: string, caption?: string }
  | { type: 'blank' };

type SpreadDef = 
  | { type: 'split', left: PageDef, right: PageDef }
  | { type: 'full', backgroundImage: string, textOverlays: TextOverlay[] };

type BookFormat = {
  title: string;
  spreads: SpreadDef[];
};

// --- Sample Book Data ---

const SAMPLE_BOOK: BookFormat = {
  title: "Alice's Adventures",
  spreads: [
    {
      type: 'split',
      left: {
        type: 'text',
        content: "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, 'and what is the use of a book,' thought Alice 'without pictures or conversations?'\n\nSo she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her."
      },
      right: {
        type: 'image',
        url: "https://picsum.photos/seed/alice-rabbit/600/800",
        caption: "The White Rabbit with pink eyes"
      }
    },
    {
      type: 'full',
      backgroundImage: "https://picsum.photos/seed/alice-falling/1200/800",
      textOverlays: [
        {
          id: "overlay-1",
          content: "In another moment down went Alice after it, never once considering how in the world she was to get out again.",
          position: { top: 15, left: 10, width: 35 },
          style: { color: "white", fontSize: "1.6rem", fontWeight: "bold", textShadow: "2px 2px 8px rgba(0,0,0,0.9)", textAlign: "center" }
        },
        {
          id: "overlay-2",
          content: "The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself before she found herself falling down a very deep well.",
          position: { top: 60, left: 55, width: 35 },
          style: { color: "white", fontSize: "1.4rem", fontWeight: "bold", textShadow: "2px 2px 8px rgba(0,0,0,0.9)", textAlign: "center" }
        }
      ]
    },
    {
      type: 'split',
      left: {
        type: 'image',
        url: "https://picsum.photos/seed/alice-jar/600/800",
        caption: "ORANGE MARMALADE"
      },
      right: {
        type: 'text',
        content: "Either the well was very deep, or she fell very slowly, for she had plenty of time as she went down to look about her and to wonder what was going to happen next. First, she tried to look down and make out what she was coming to, but it was too dark to see anything; then she looked at the sides of the well, and noticed that they were filled with cupboards and book-shelves; here and there she saw maps and pictures hung upon pegs.\n\nShe took down a jar from one of the shelves as she passed; it was labelled 'ORANGE MARMALADE', but to her great disappointment it was empty: she did not like to drop the jar for fear of killing somebody, so managed to put it into one of the cupboards as she fell past it."
      }
    }
  ]
};

// --- Parsed Types for Rendering & Audio ---

type ParsedWord = {
  id: number;
  text: string;
  spreadIndex: number;
  hasNewline: boolean;
  hasDoubleNewline: boolean;
};

type ParsedPageDef = 
  | { type: 'text', words: ParsedWord[] }
  | { type: 'image', url: string, caption?: string }
  | { type: 'blank' };

type ParsedOverlay = TextOverlay & { words: ParsedWord[] };

type ParsedSpread = 
  | { type: 'split', left: ParsedPageDef, right: ParsedPageDef }
  | { type: 'full', backgroundImage: string, overlays: ParsedOverlay[] };


export default function App() {
  // --- Parsing Logic ---
  const { parsedSpreads, allWords } = useMemo(() => {
    const spreads: ParsedSpread[] = [];
    const words: ParsedWord[] = [];
    let wordId = 0;

    const parseText = (text: string, spreadIndex: number): ParsedWord[] => {
      const parsed: ParsedWord[] = [];
      const regex = /\S+/g;
      let match;
      let lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        const precedingWhitespace = text.slice(lastIndex, match.index);
        const word: ParsedWord = {
          id: wordId++,
          text: match[0],
          spreadIndex,
          hasNewline: precedingWhitespace.includes('\n'),
          hasDoubleNewline: precedingWhitespace.includes('\n\n')
        };
        parsed.push(word);
        words.push(word);
        lastIndex = match.index + match[0].length;
      }
      return parsed;
    };

    SAMPLE_BOOK.spreads.forEach((spread, spreadIndex) => {
      if (spread.type === 'split') {
        const parsePage = (page: PageDef): ParsedPageDef => {
          if (page.type === 'text') return { type: 'text', words: parseText(page.content, spreadIndex) };
          if (page.type === 'image') return { type: 'image', url: page.url, caption: page.caption };
          return { type: 'blank' };
        };
        spreads.push({
          type: 'split',
          left: parsePage(spread.left),
          right: parsePage(spread.right)
        });
      } else if (spread.type === 'full') {
        const overlays = spread.textOverlays.map(overlay => ({
          ...overlay,
          words: parseText(overlay.content, spreadIndex)
        }));
        spreads.push({
          type: 'full',
          backgroundImage: spread.backgroundImage,
          overlays
        });
      }
    });

    return { parsedSpreads: spreads, allWords: words };
  }, []);

  // --- State ---
  const [activeWordId, setActiveWordId] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpread, setCurrentSpread] = useState(0);
  const [audioSource, setAudioSource] = useState<'tts' | 'file'>('tts');
  const [audioUrl, setAudioUrl] = useState('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Store overlay positions separately so dragging doesn't re-parse the book
  const [overlayPositions, setOverlayPositions] = useState<Record<string, {top: number, left: number}>>(() => {
    const pos: Record<string, {top: number, left: number}> = {};
    SAMPLE_BOOK.spreads.forEach(spread => {
      if (spread.type === 'full') {
        spread.textOverlays.forEach(o => {
          pos[o.id] = { top: o.position.top, left: o.position.left };
        });
      }
    });
    return pos;
  });

  const [dragging, setDragging] = useState<{
    overlayId: string;
    startX: number;
    startY: number;
    startTop: number;
    startLeft: number;
  } | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const totalSpreads = parsedSpreads.length;

  // --- Effects ---
  useEffect(() => {
    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoiceURI) {
        const defaultVoice = availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];
        setSelectedVoiceURI(defaultVoice.voiceURI);
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [selectedVoiceURI]);

  // Dragging logic
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!bookRef.current) return;
      const rect = bookRef.current.getBoundingClientRect();
      
      const deltaX = e.clientX - dragging.startX;
      const deltaY = e.clientY - dragging.startY;
      
      const deltaLeftPercent = (deltaX / rect.width) * 100;
      const deltaTopPercent = (deltaY / rect.height) * 100;

      setOverlayPositions(prev => ({
        ...prev,
        [dragging.overlayId]: {
          top: Math.max(0, Math.min(90, dragging.startTop + deltaTopPercent)),
          left: Math.max(0, Math.min(90, dragging.startLeft + deltaLeftPercent))
        }
      }));
    };

    const handleMouseUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  // --- Audio Controls ---
  const startTTS = () => {
    window.speechSynthesis.cancel();
    
    let startIndex = activeWordId;
    if (startIndex === -1) {
      const firstWordOnSpread = allWords.find(w => w.spreadIndex === currentSpread);
      startIndex = firstWordOnSpread ? firstWordOnSpread.id : 0;
    }
    
    const wordsToSpeak = allWords.slice(startIndex);
    if (wordsToSpeak.length === 0) return;

    const textToSpeak = wordsToSpeak.map(w => w.text).join(' ');
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    
    if (selectedVoiceURI) {
      const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
    }
    
    let currentLength = 0;
    const charIndexToWordId: { start: number, end: number, id: number }[] = [];
    
    for (const w of wordsToSpeak) {
      const wordLen = w.text.length;
      charIndexToWordId.push({
        start: currentLength,
        end: currentLength + wordLen,
        id: w.id
      });
      currentLength += wordLen + 1; // +1 for space
    }

    utterance.onboundary = (e) => {
      if (e.name === 'word') {
        const mapping = charIndexToWordId.find(m => e.charIndex >= m.start && e.charIndex <= m.end);
        if (mapping) {
          setActiveWordId(mapping.id);
          const word = allWords.find(w => w.id === mapping.id);
          if (word) {
            setCurrentSpread(prev => prev !== word.spreadIndex ? word.spreadIndex : prev);
          }
        }
      }
    };
    
    utterance.onend = () => {
      setIsPlaying(false);
      setActiveWordId(-1);
    };
    
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  };

  const handlePlayPause = () => {
    if (audioSource === 'tts') {
      if (isPlaying) {
        window.speechSynthesis.pause();
        setIsPlaying(false);
      } else {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
          setIsPlaying(true);
        } else {
          startTTS();
        }
      }
    } else {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
        } else {
          audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
      }
    }
  };

  const handleStop = () => {
    if (audioSource === 'tts') {
      window.speechSynthesis.cancel();
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setActiveWordId(-1);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const progress = audioRef.current.currentTime / audioRef.current.duration;
    if (isNaN(progress)) return;
    
    const estimatedWordIndex = Math.floor(progress * allWords.length);
    setActiveWordId(estimatedWordIndex);
    
    const word = allWords.find(w => w.id === estimatedWordIndex);
    if (word) {
      setCurrentSpread(prev => prev !== word.spreadIndex ? word.spreadIndex : prev);
    }
  };

  const handleSpreadChange = (newSpread: number) => {
    if (isPlaying) handleStop();
    setCurrentSpread(newSpread);
  };

  // --- Render Helpers ---
  const renderWords = (words: ParsedWord[]) => (
    <>
      {words.map((word, idx) => (
        <React.Fragment key={word.id}>
          {word.hasDoubleNewline && <div className="h-2 sm:h-4 w-full" />}
          {!word.hasDoubleNewline && word.hasNewline && <div className="w-full" />}
          {!word.hasNewline && idx > 0 && ' '}
          <span 
            onClick={(e) => {
              if (isAdmin) return;
              e.stopPropagation();
              setActiveWordId(word.id);
              if (isPlaying) handleStop();
            }}
            className={`transition-colors duration-150 inline-block ${!isAdmin ? 'cursor-pointer hover:bg-yellow-400/80' : ''} ${
              word.id === activeWordId 
                ? 'bg-yellow-400 text-black rounded px-1 shadow-sm' 
                : ''
            }`}
          >
            {word.text}
          </span>
        </React.Fragment>
      ))}
    </>
  );

  const renderPage = (page: ParsedPageDef) => {
    if (page.type === 'text') {
      return (
        <div className="text-[10px] sm:text-sm md:text-lg leading-relaxed text-gray-800 font-serif text-justify h-full p-4 sm:p-8 md:p-12">
          {renderWords(page.words)}
        </div>
      );
    }
    if (page.type === 'image') {
      return (
        <div className="h-full flex flex-col items-center justify-center p-4 sm:p-8 md:p-12 bg-white/50">
          <img src={page.url} alt={page.caption || "Illustration"} className="max-w-full max-h-[80%] object-contain rounded shadow-md" referrerPolicy="no-referrer" />
          {page.caption && <p className="mt-4 text-sm text-gray-600 font-serif italic text-center">{page.caption}</p>}
        </div>
      );
    }
    return null;
  };

  const renderSpread = (index: number) => {
    const spread = parsedSpreads[index];
    if (!spread) return null;

    if (spread.type === 'split') {
      return (
        <>
          <div className="w-1/2 h-full relative z-10 border-r border-gray-200/50 overflow-hidden">
            {renderPage(spread.left)}
            <div className="absolute bottom-2 sm:bottom-4 left-0 right-0 text-center text-[10px] sm:text-sm text-gray-400 font-serif drop-shadow-md z-20">
              {index * 2 + 1}
            </div>
          </div>
          <div className="w-1/2 h-full relative z-10 overflow-hidden">
            {renderPage(spread.right)}
            <div className="absolute bottom-2 sm:bottom-4 left-0 right-0 text-center text-[10px] sm:text-sm text-gray-400 font-serif drop-shadow-md z-20">
              {index * 2 + 2}
            </div>
          </div>
        </>
      );
    }

    if (spread.type === 'full') {
      return (
        <div className="w-full h-full relative z-10 overflow-hidden">
          <img src={spread.backgroundImage} alt="Background" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-black/10 pointer-events-none" />
          
          {spread.overlays.map((overlay) => {
            const pos = overlayPositions[overlay.id] || overlay.position;
            return (
              <div 
                key={overlay.id} 
                className={`absolute transition-shadow ${isAdmin ? 'ring-2 ring-blue-500 ring-dashed bg-blue-500/20 cursor-move hover:bg-blue-500/30' : ''}`}
                style={{ 
                  top: `${pos.top}%`, 
                  left: `${pos.left}%`, 
                  width: `${overlay.position.width}%`,
                  ...overlay.style 
                }}
                onMouseDown={(e) => {
                  if (!isAdmin) return;
                  e.stopPropagation();
                  setDragging({
                    overlayId: overlay.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    startTop: pos.top,
                    startLeft: pos.left
                  });
                }}
              >
                {isAdmin && (
                  <div className="absolute -top-3 -left-3 bg-blue-600 text-white rounded-full p-1.5 shadow-lg cursor-move">
                    <Move size={14} />
                  </div>
                )}
                {renderWords(overlay.words)}
              </div>
            );
          })}

          <div className="absolute bottom-2 sm:bottom-4 left-0 w-1/2 text-center text-[10px] sm:text-sm text-white/80 font-serif drop-shadow-md z-20">
            {index * 2 + 1}
          </div>
          <div className="absolute bottom-2 sm:bottom-4 right-0 w-1/2 text-center text-[10px] sm:text-sm text-white/80 font-serif drop-shadow-md z-20">
            {index * 2 + 2}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-100 font-sans">
      {/* Header Controls */}
      <div className="bg-white border-b px-4 sm:px-6 py-4 flex flex-col lg:flex-row items-center justify-between shadow-sm z-30 gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          <h1 className="text-xl font-semibold text-gray-800">{SAMPLE_BOOK.title}</h1>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2 mr-2">
            <button
              onClick={() => {
                setIsAdmin(!isAdmin);
                if (isPlaying) handleStop();
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isAdmin ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Settings className="w-4 h-4" />
              {isAdmin ? 'Exit Admin' : 'Admin Mode'}
            </button>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => { setAudioSource('tts'); handleStop(); }}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                audioSource === 'tts' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Volume2 className="w-4 h-4 inline-block mr-1 sm:mr-2" />
              TTS
            </button>
            <button
              onClick={() => { setAudioSource('file'); handleStop(); }}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                audioSource === 'file' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileAudio className="w-4 h-4 inline-block mr-1 sm:mr-2" />
              Audio File
            </button>
          </div>

          {audioSource === 'tts' && voices.length > 0 && (
            <div className="flex items-center gap-2 bg-gray-50 border rounded-md px-3 py-1.5">
              <Globe className="w-4 h-4 text-gray-500" />
              <select
                value={selectedVoiceURI}
                onChange={(e) => {
                  setSelectedVoiceURI(e.target.value);
                  if (isPlaying) handleStop();
                }}
                className="text-xs sm:text-sm bg-transparent focus:outline-none w-32 sm:w-48 truncate text-gray-700 font-medium"
              >
                {voices.map(v => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
          )}

          {audioSource === 'file' && (
            <input 
              type="text" 
              placeholder="Audio URL (.mp3)" 
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              className="text-xs sm:text-sm border rounded-md px-3 py-1.5 w-40 sm:w-48 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          )}

          <div className="flex items-center gap-2 lg:border-l lg:pl-6">
            <button 
              onClick={handlePlayPause}
              disabled={isAdmin}
              className="p-2 sm:p-2.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />}
            </button>
            <button 
              onClick={handleStop}
              className="p-2 sm:p-2.5 rounded-full text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <Square className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Admin Warning Bar */}
      <AnimatePresence>
        {isAdmin && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-blue-50 border-b border-blue-200 px-6 py-2 text-sm text-blue-800 flex justify-center items-center gap-2 overflow-hidden"
          >
            <Move className="w-4 h-4" />
            <strong>Admin Mode Active:</strong> You can click and drag the text blocks on full-spread pages to reposition them. Audio playback is disabled.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Book Area */}
      <div className="flex-1 flex items-center justify-center bg-stone-200 p-2 sm:p-8 overflow-hidden">
        <div 
          ref={bookRef}
          className="relative w-full max-w-5xl aspect-[1.5/1] sm:aspect-[2/1.3] flex shadow-2xl rounded-lg bg-[#4a3b32] p-1 sm:p-2 select-none"
        >
          <div className="flex w-full h-full bg-[#fdfbf7] rounded shadow-inner relative overflow-hidden">
            {/* Spine Shadow */}
            <div className="absolute left-1/2 top-0 bottom-0 w-8 sm:w-12 -ml-4 sm:-ml-6 bg-gradient-to-r from-black/5 via-black/10 to-black/5 z-20 pointer-events-none" />
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-black/10 z-20 pointer-events-none" />
            
            <AnimatePresence mode="wait">
              <motion.div
                key={`spread-${currentSpread}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full flex absolute inset-0"
              >
                {renderSpread(currentSpread)}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="bg-white border-t px-6 py-4 flex items-center justify-center gap-6 sm:gap-8 shadow-sm z-30 relative">
        <button 
          onClick={() => handleSpreadChange(Math.max(0, currentSpread - 1))}
          disabled={currentSpread === 0}
          className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
        </button>
        
        <span className="text-xs sm:text-sm font-medium text-gray-500">
          Spread {currentSpread + 1} of {totalSpreads}
        </span>

        <button 
          onClick={() => handleSpreadChange(Math.min(totalSpreads - 1, currentSpread + 1))}
          disabled={currentSpread === totalSpreads - 1}
          className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
        </button>
      </div>

      {audioSource === 'file' && audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { setIsPlaying(false); setActiveWordId(-1); }}
          className="hidden"
        />
      )}
    </div>
  );
}
