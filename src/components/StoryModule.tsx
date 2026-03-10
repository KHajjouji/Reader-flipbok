import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Square, Volume2, FileAudio, ChevronLeft, ChevronRight, BookOpen, Globe, Settings, Move, Plus, Trash2, Image as ImageIcon, Type, LayoutTemplate } from 'lucide-react';

// --- Types for Multi-Language Book Format ---

export type MultiLangString = Record<string, string>;

export type TextOverlay = {
  id: string;
  content: MultiLangString;
  position: { top: number, left: number, width: number }; // Percentages
  style?: React.CSSProperties;
};

export type PageDef = 
  | { type: 'text', content: MultiLangString }
  | { type: 'image', url: string, caption?: MultiLangString }
  | { type: 'blank' };

export type SpreadDef = 
  | { id: string, type: 'split', left: PageDef, right: PageDef }
  | { id: string, type: 'full', backgroundImage: string, textOverlays: TextOverlay[] };

export type BookFormat = {
  title: string;
  languages: { code: string, label: string }[];
  spreads: SpreadDef[];
};

// --- Sample Initial Book Data (Darija Word Wizard Context) ---

const INITIAL_BOOK: BookFormat = {
  title: "The Little Explorer - المستكشف الصغير",
  languages: [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'ar', label: 'Darija (Moroccan)' }
  ],
  spreads: [
    {
      id: "spread-1",
      type: 'split',
      left: {
        type: 'text',
        content: {
          en: "Once upon a time, there was a little boy named Sami who loved to explore the old medina. He would run through the narrow streets, looking at all the colorful shops and smelling the fresh spices.",
          fr: "Il était une fois un petit garçon nommé Sami qui adorait explorer l'ancienne médina. Il courait dans les rues étroites, regardant toutes les boutiques colorées et sentant les épices fraîches.",
          ar: "واحد النهار، كان واحد الولد سميتو سامي كيعجبو يكتشف المدينة القديمة. كان كيجري ف الزناقي الضيقين، كيشوف ف الحوانت الملونين وكيشم ريحة العطرية الطرية."
        }
      },
      right: {
        type: 'image',
        url: "https://picsum.photos/seed/medina/600/800",
        caption: {
          en: "The colorful medina",
          fr: "La médina colorée",
          ar: "المدينة الملونة"
        }
      }
    },
    {
      id: "spread-2",
      type: 'full',
      backgroundImage: "https://picsum.photos/seed/morocco-door/1200/800",
      textOverlays: [
        {
          id: "overlay-1",
          content: {
            en: "One day, he found a mysterious blue door that he had never seen before.",
            fr: "Un jour, il trouva une mystérieuse porte bleue qu'il n'avait jamais vue auparavant.",
            ar: "واحد النهار، لقى واحد الباب زرق غريب عمرو ما شافو من قبل."
          },
          position: { top: 15, left: 10, width: 35 },
          style: { color: "white", fontSize: "3cqw", fontWeight: "bold", textShadow: "2px 2px 8px rgba(0,0,0,0.9)", textAlign: "center" }
        },
        {
          id: "overlay-2",
          content: {
            en: "He pushed it open slowly, and inside, he discovered a magical garden full of talking animals!",
            fr: "Il la poussa lentement, et à l'intérieur, il découvrit un jardin magique plein d'animaux parlants !",
            ar: "دفعو بشوية، ولداخل، كتاشف واحد الجردة سحرية عامرة بالحيوانات اللي كتهضر!"
          },
          position: { top: 60, left: 55, width: 35 },
          style: { color: "white", fontSize: "2.5cqw", fontWeight: "bold", textShadow: "2px 2px 8px rgba(0,0,0,0.9)", textAlign: "center" }
        }
      ]
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
  | { id: string, type: 'split', left: ParsedPageDef, right: ParsedPageDef }
  | { id: string, type: 'full', backgroundImage: string, overlays: ParsedOverlay[] };

interface StoryModuleProps {
  initialBook?: BookFormat;
  onSave?: (book: BookFormat) => void;
}

export default function StoryModule({ initialBook = INITIAL_BOOK, onSave }: StoryModuleProps) {
  // --- State ---
  const [book, setBook] = useState<BookFormat>(initialBook);
  const [currentLang, setCurrentLang] = useState(book.languages[0]?.code || 'en');
  
  const [activeWordId, setActiveWordId] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpread, setCurrentSpread] = useState(0);
  const [direction, setDirection] = useState(1); // 1 for next, -1 for prev (for animation)
  
  const [audioSource, setAudioSource] = useState<'tts' | 'file'>('tts');
  const [audioUrl, setAudioUrl] = useState('');
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [dragging, setDragging] = useState<{
    overlayId: string;
    startX: number;
    startY: number;
    startTop: number;
    startLeft: number;
  } | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);

  // --- Parsing Logic (Re-runs when book or language changes) ---
  const { parsedSpreads, allWords } = useMemo(() => {
    const spreads: ParsedSpread[] = [];
    const words: ParsedWord[] = [];
    let wordId = 0;

    const parseText = (multiLangText: MultiLangString | undefined, spreadIndex: number): ParsedWord[] => {
      if (!multiLangText) return [];
      const text = multiLangText[currentLang] || multiLangText['en'] || '';
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

    book.spreads.forEach((spread, spreadIndex) => {
      if (spread.type === 'split') {
        const parsePage = (page: PageDef): ParsedPageDef => {
          if (page.type === 'text') return { type: 'text', words: parseText(page.content, spreadIndex) };
          if (page.type === 'image') return { type: 'image', url: page.url, caption: page.caption?.[currentLang] || page.caption?.['en'] };
          return { type: 'blank' };
        };
        spreads.push({
          id: spread.id,
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
          id: spread.id,
          type: 'full',
          backgroundImage: spread.backgroundImage,
          overlays
        });
      }
    });

    return { parsedSpreads: spreads, allWords: words };
  }, [book, currentLang]);

  const totalSpreads = parsedSpreads.length;

  // --- Effects ---
  useEffect(() => {
    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0) {
        // Try to find a voice matching the current language
        const langVoice = availableVoices.find(v => v.lang.startsWith(currentLang)) || availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];
        setSelectedVoiceURI(langVoice.voiceURI);
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [currentLang]);

  // Dragging logic for Admin Mode
  useEffect(() => {
    if (!dragging || !isAdmin) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!bookRef.current) return;
      const rect = bookRef.current.getBoundingClientRect();
      
      const deltaX = e.clientX - dragging.startX;
      const deltaY = e.clientY - dragging.startY;
      
      const deltaLeftPercent = (deltaX / rect.width) * 100;
      const deltaTopPercent = (deltaY / rect.height) * 100;

      const newTop = Math.max(0, Math.min(90, dragging.startTop + deltaTopPercent));
      const newLeft = Math.max(0, Math.min(90, dragging.startLeft + deltaLeftPercent));

      // Update the book state directly
      setBook(prev => {
        const newSpreads = [...prev.spreads];
        const spread = newSpreads[currentSpread];
        if (spread.type === 'full') {
          const overlayIndex = spread.textOverlays.findIndex(o => o.id === dragging.overlayId);
          if (overlayIndex !== -1) {
            spread.textOverlays[overlayIndex] = {
              ...spread.textOverlays[overlayIndex],
              position: { ...spread.textOverlays[overlayIndex].position, top: newTop, left: newLeft }
            };
          }
        }
        return { ...prev, spreads: newSpreads };
      });
    };

    const handleMouseUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, isAdmin, currentSpread]);

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
          if (word && word.spreadIndex !== currentSpread) {
            setDirection(word.spreadIndex > currentSpread ? 1 : -1);
            setCurrentSpread(word.spreadIndex);
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
    if (word && word.spreadIndex !== currentSpread) {
      setDirection(word.spreadIndex > currentSpread ? 1 : -1);
      setCurrentSpread(word.spreadIndex);
    }
  };

  const handleSpreadChange = (newSpread: number) => {
    if (isPlaying) handleStop();
    setDirection(newSpread > currentSpread ? 1 : -1);
    setCurrentSpread(newSpread);
  };

  // --- Admin Helpers ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          callback(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const updateCurrentSpread = (updater: (spread: SpreadDef) => SpreadDef) => {
    setBook(prev => {
      const newSpreads = [...prev.spreads];
      newSpreads[currentSpread] = updater(newSpreads[currentSpread]);
      return { ...prev, spreads: newSpreads };
    });
  };

  const addSpread = () => {
    setBook(prev => ({
      ...prev,
      spreads: [
        ...prev.spreads,
        {
          id: `spread-${Date.now()}`,
          type: 'full',
          backgroundImage: 'https://picsum.photos/seed/new/1200/800',
          textOverlays: []
        }
      ]
    }));
    setDirection(1);
    setCurrentSpread(book.spreads.length);
  };

  const deleteSpread = () => {
    if (book.spreads.length <= 1) return;
    setBook(prev => {
      const newSpreads = [...prev.spreads];
      newSpreads.splice(currentSpread, 1);
      return { ...prev, spreads: newSpreads };
    });
    setCurrentSpread(Math.max(0, currentSpread - 1));
  };

  const saveBook = () => {
    if (onSave) {
      onSave(book);
    } else {
      console.log("Book saved:", book);
      alert("Book saved! (Check console for JSON)");
    }
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
        <div className="text-[2.5cqw] leading-relaxed text-gray-800 font-serif text-justify h-full p-[5cqw]">
          {renderWords(page.words)}
        </div>
      );
    }
    if (page.type === 'image') {
      return (
        <div className="h-full flex flex-col items-center justify-center p-[5cqw] bg-white/50">
          <img src={page.url} alt={page.caption || "Illustration"} className="max-w-full max-h-[80%] object-contain rounded shadow-md" referrerPolicy="no-referrer" />
          {page.caption && <p className="mt-[2cqw] text-[1.5cqw] text-gray-600 font-serif italic text-center">{page.caption}</p>}
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
          <div className="w-1/2 h-full relative z-10 border-r border-gray-200/50 overflow-hidden bg-[#fdfbf7]">
            {renderPage(spread.left)}
            <div className="absolute bottom-[2cqw] left-0 right-0 text-center text-[1.5cqw] text-gray-400 font-serif drop-shadow-md z-20">
              {index * 2 + 1}
            </div>
          </div>
          <div className="w-1/2 h-full relative z-10 overflow-hidden bg-[#fdfbf7]">
            {renderPage(spread.right)}
            <div className="absolute bottom-[2cqw] left-0 right-0 text-center text-[1.5cqw] text-gray-400 font-serif drop-shadow-md z-20">
              {index * 2 + 2}
            </div>
          </div>
        </>
      );
    }

    if (spread.type === 'full') {
      return (
        <div className="w-full h-full relative z-10 overflow-hidden bg-[#fdfbf7]">
          <img src={spread.backgroundImage} alt="Background" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-black/10 pointer-events-none" />
          
          {spread.overlays.map((overlay) => {
            return (
              <div 
                key={overlay.id} 
                className={`absolute transition-shadow ${isAdmin ? 'ring-2 ring-blue-500 ring-dashed bg-blue-500/20 cursor-move hover:bg-blue-500/30' : ''}`}
                style={{ 
                  top: `${overlay.position.top}%`, 
                  left: `${overlay.position.left}%`, 
                  width: `${overlay.position.width}%`,
                  ...overlay.style,
                  // Use container query width (cqw) for responsive text scaling
                  fontSize: overlay.style?.fontSize || '3cqw'
                }}
                onMouseDown={(e) => {
                  if (!isAdmin) return;
                  e.stopPropagation();
                  setDragging({
                    overlayId: overlay.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    startTop: overlay.position.top,
                    startLeft: overlay.position.left
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

          <div className="absolute bottom-[2cqw] left-0 w-1/2 text-center text-[1.5cqw] text-white/80 font-serif drop-shadow-md z-20">
            {index * 2 + 1}
          </div>
          <div className="absolute bottom-[2cqw] right-0 w-1/2 text-center text-[1.5cqw] text-white/80 font-serif drop-shadow-md z-20">
            {index * 2 + 2}
          </div>
        </div>
      );
    }

    return null;
  };

  // --- Page Flip Animation Variants ---
  const flipVariants = {
    enter: (dir: number) => ({
      rotateY: dir > 0 ? 90 : -90,
      opacity: 0,
      transformOrigin: dir > 0 ? 'right' : 'left',
    }),
    center: {
      rotateY: 0,
      opacity: 1,
      transformOrigin: 'center',
    },
    exit: (dir: number) => ({
      rotateY: dir < 0 ? 90 : -90,
      opacity: 0,
      transformOrigin: dir < 0 ? 'right' : 'left',
    })
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-100 font-sans overflow-hidden">
      {/* Header Controls */}
      <div className="bg-white border-b px-4 sm:px-6 py-4 flex flex-col lg:flex-row items-center justify-between shadow-sm z-30 gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          <h1 className="text-xl font-semibold text-gray-800">{book.title}</h1>
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

          {/* Language Selector for Reader */}
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-md px-3 py-1.5">
            <Globe className="w-4 h-4 text-indigo-600" />
            <select
              value={currentLang}
              onChange={(e) => {
                setCurrentLang(e.target.value);
                if (isPlaying) handleStop();
              }}
              className="text-xs sm:text-sm bg-transparent focus:outline-none w-24 truncate text-indigo-900 font-medium"
            >
              {book.languages.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
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
            <select
              value={selectedVoiceURI}
              onChange={(e) => {
                setSelectedVoiceURI(e.target.value);
                if (isPlaying) handleStop();
              }}
              className="text-xs sm:text-sm border rounded-md px-2 py-1.5 w-32 sm:w-48 focus:ring-2 focus:ring-indigo-500 outline-none bg-white truncate"
            >
              {voices.map(v => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
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

      <div className="flex-1 flex overflow-hidden">
        {/* Main Book Area */}
        <div className="flex-1 flex flex-col relative">
          <div className="flex-1 flex items-center justify-center p-2 sm:p-8 overflow-hidden perspective-[2000px]">
            {/* The @container class makes the book responsive using container queries (cqw) */}
            <div 
              ref={bookRef}
              className="relative w-full max-w-5xl aspect-[1.5/1] sm:aspect-[2/1.3] flex shadow-2xl rounded-lg bg-[#4a3b32] p-1 sm:p-2 select-none @container"
            >
              <div className="flex w-full h-full bg-[#fdfbf7] rounded shadow-inner relative overflow-hidden">
                {/* Spine Shadow */}
                <div className="absolute left-1/2 top-0 bottom-0 w-[6cqw] -ml-[3cqw] bg-gradient-to-r from-black/5 via-black/10 to-black/5 z-20 pointer-events-none" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-black/10 z-20 pointer-events-none" />
                
                {/* 3D Flip Animation */}
                <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                  <motion.div
                    key={`spread-${currentSpread}`}
                    custom={direction}
                    variants={flipVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.6, type: 'spring', bounce: 0.1 }}
                    className="w-full h-full flex absolute inset-0"
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    {renderSpread(currentSpread)}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="bg-white/80 backdrop-blur border-t px-6 py-4 flex items-center justify-center gap-6 sm:gap-8 shadow-sm z-30">
            <button 
              onClick={() => handleSpreadChange(Math.max(0, currentSpread - 1))}
              disabled={currentSpread === 0}
              className="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
            </button>
            
            <span className="text-xs sm:text-sm font-medium text-gray-500">
              Spread {currentSpread + 1} of {totalSpreads}
            </span>

            <button 
              onClick={() => handleSpreadChange(Math.min(totalSpreads - 1, currentSpread + 1))}
              disabled={currentSpread === totalSpreads - 1}
              className="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
            </button>
          </div>
        </div>

        {/* Admin Sidebar */}
        <AnimatePresence>
          {isAdmin && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-white border-l shadow-2xl overflow-y-auto flex flex-col z-40"
            >
              <div className="p-4 border-b bg-gray-50 flex justify-between items-center sticky top-0 z-10">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <Settings className="w-5 h-5" /> Book Editor
                </h2>
                <div className="flex gap-2">
                  <button onClick={saveBook} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 font-medium">
                    Save
                  </button>
                  <button onClick={addSpread} className="p-1.5 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200" title="Add Spread">
                    <Plus className="w-4 h-4" />
                  </button>
                  <button onClick={deleteSpread} disabled={book.spreads.length <= 1} className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50" title="Delete Spread">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-6">
                {/* Current Spread Editor */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Spread {currentSpread + 1} Settings</h3>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Layout Style</label>
                    <select 
                      value={book.spreads[currentSpread].type}
                      onChange={(e) => {
                        const type = e.target.value as 'split' | 'full';
                        updateCurrentSpread(s => {
                          if (type === 'full') return { id: s.id, type: 'full', backgroundImage: 'https://picsum.photos/seed/new/1200/800', textOverlays: [] };
                          return { id: s.id, type: 'split', left: { type: 'blank' }, right: { type: 'blank' } };
                        });
                      }}
                      className="w-full text-sm border rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="split">Split (Two Pages)</option>
                      <option value="full">Full (Children's Book Style)</option>
                    </select>
                  </div>

                  {book.spreads[currentSpread].type === 'full' && (
                    <div className="space-y-4 border-t pt-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Background Image</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={(book.spreads[currentSpread] as any).backgroundImage}
                            onChange={(e) => updateCurrentSpread(s => ({ ...s, backgroundImage: e.target.value }))}
                            className="flex-1 text-sm border rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Image URL"
                          />
                          <label className="cursor-pointer bg-gray-100 p-2 rounded-md hover:bg-gray-200 border">
                            <ImageIcon className="w-4 h-4 text-gray-600" />
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, url => updateCurrentSpread(s => ({ ...s, backgroundImage: url })))} />
                          </label>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-medium text-gray-700">Text Overlays</label>
                          <button 
                            onClick={() => updateCurrentSpread(s => {
                              if (s.type !== 'full') return s;
                              return {
                                ...s,
                                textOverlays: [...s.textOverlays, {
                                  id: `overlay-${Date.now()}`,
                                  content: { en: "New text" },
                                  position: { top: 50, left: 50, width: 30 },
                                  style: { color: "white", fontSize: "3cqw", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }
                                }]
                              };
                            })}
                            className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Text
                          </button>
                        </div>

                        <div className="space-y-3">
                          {(book.spreads[currentSpread] as any).textOverlays.map((overlay: TextOverlay, idx: number) => (
                            <div key={overlay.id} className="border rounded-md p-3 bg-gray-50 relative">
                              <button 
                                onClick={() => updateCurrentSpread(s => {
                                  if (s.type !== 'full') return s;
                                  const newOverlays = [...s.textOverlays];
                                  newOverlays.splice(idx, 1);
                                  return { ...s, textOverlays: newOverlays };
                                })}
                                className="absolute top-2 right-2 text-red-400 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Type className="w-3 h-3"/> Overlay {idx + 1}</div>
                              
                              {book.languages.map(lang => (
                                <div key={lang.code} className="mb-2">
                                  <label className="block text-[10px] text-gray-500 uppercase">{lang.label}</label>
                                  <textarea 
                                    value={overlay.content[lang.code] || ''}
                                    onChange={(e) => updateCurrentSpread(s => {
                                      if (s.type !== 'full') return s;
                                      const newOverlays = [...s.textOverlays];
                                      newOverlays[idx] = { ...newOverlays[idx], content: { ...newOverlays[idx].content, [lang.code]: e.target.value } };
                                      return { ...s, textOverlays: newOverlays };
                                    })}
                                    className="w-full text-sm border rounded px-2 py-1 min-h-[60px]"
                                    placeholder={`Text in ${lang.label}`}
                                  />
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {book.spreads[currentSpread].type === 'split' && (
                    <div className="space-y-6 border-t pt-4">
                      {/* Left Page Editor */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-800 flex items-center gap-2"><LayoutTemplate className="w-4 h-4"/> Left Page</h4>
                        <select 
                          value={(book.spreads[currentSpread] as any).left.type}
                          onChange={(e) => updateCurrentSpread(s => {
                            if (s.type !== 'split') return s;
                            const type = e.target.value as 'text' | 'image' | 'blank';
                            let newPage: PageDef = { type: 'blank' };
                            if (type === 'text') newPage = { type: 'text', content: { en: "New text" } };
                            if (type === 'image') newPage = { type: 'image', url: "https://picsum.photos/seed/new/600/800" };
                            return { ...s, left: newPage };
                          })}
                          className="w-full text-sm border rounded-md px-3 py-2"
                        >
                          <option value="text">Text</option>
                          <option value="image">Image</option>
                          <option value="blank">Blank</option>
                        </select>

                        {(book.spreads[currentSpread] as any).left.type === 'text' && book.languages.map(lang => (
                          <div key={lang.code}>
                            <label className="block text-[10px] text-gray-500 uppercase">{lang.label}</label>
                            <textarea 
                              value={(book.spreads[currentSpread] as any).left.content[lang.code] || ''}
                              onChange={(e) => updateCurrentSpread(s => {
                                if (s.type !== 'split' || s.left.type !== 'text') return s;
                                return { ...s, left: { ...s.left, content: { ...s.left.content, [lang.code]: e.target.value } } };
                              })}
                              className="w-full text-sm border rounded px-2 py-1 min-h-[80px]"
                            />
                          </div>
                        ))}

                        {(book.spreads[currentSpread] as any).left.type === 'image' && (
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={(book.spreads[currentSpread] as any).left.url}
                              onChange={(e) => updateCurrentSpread(s => {
                                if (s.type !== 'split' || s.left.type !== 'image') return s;
                                return { ...s, left: { ...s.left, url: e.target.value } };
                              })}
                              className="flex-1 text-sm border rounded-md px-3 py-2"
                              placeholder="Image URL"
                            />
                            <label className="cursor-pointer bg-gray-100 p-2 rounded-md hover:bg-gray-200 border">
                              <ImageIcon className="w-4 h-4 text-gray-600" />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, url => updateCurrentSpread(s => {
                                if (s.type !== 'split' || s.left.type !== 'image') return s;
                                return { ...s, left: { ...s.left, url } };
                              }))} />
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Right Page Editor */}
                      <div className="space-y-3 border-t pt-4">
                        <h4 className="text-sm font-medium text-gray-800 flex items-center gap-2"><LayoutTemplate className="w-4 h-4"/> Right Page</h4>
                        <select 
                          value={(book.spreads[currentSpread] as any).right.type}
                          onChange={(e) => updateCurrentSpread(s => {
                            if (s.type !== 'split') return s;
                            const type = e.target.value as 'text' | 'image' | 'blank';
                            let newPage: PageDef = { type: 'blank' };
                            if (type === 'text') newPage = { type: 'text', content: { en: "New text" } };
                            if (type === 'image') newPage = { type: 'image', url: "https://picsum.photos/seed/new/600/800" };
                            return { ...s, right: newPage };
                          })}
                          className="w-full text-sm border rounded-md px-3 py-2"
                        >
                          <option value="text">Text</option>
                          <option value="image">Image</option>
                          <option value="blank">Blank</option>
                        </select>

                        {(book.spreads[currentSpread] as any).right.type === 'text' && book.languages.map(lang => (
                          <div key={lang.code}>
                            <label className="block text-[10px] text-gray-500 uppercase">{lang.label}</label>
                            <textarea 
                              value={(book.spreads[currentSpread] as any).right.content[lang.code] || ''}
                              onChange={(e) => updateCurrentSpread(s => {
                                if (s.type !== 'split' || s.right.type !== 'text') return s;
                                return { ...s, right: { ...s.right, content: { ...s.right.content, [lang.code]: e.target.value } } };
                              })}
                              className="w-full text-sm border rounded px-2 py-1 min-h-[80px]"
                            />
                          </div>
                        ))}

                        {(book.spreads[currentSpread] as any).right.type === 'image' && (
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={(book.spreads[currentSpread] as any).right.url}
                              onChange={(e) => updateCurrentSpread(s => {
                                if (s.type !== 'split' || s.right.type !== 'image') return s;
                                return { ...s, right: { ...s.right, url: e.target.value } };
                              })}
                              className="flex-1 text-sm border rounded-md px-3 py-2"
                              placeholder="Image URL"
                            />
                            <label className="cursor-pointer bg-gray-100 p-2 rounded-md hover:bg-gray-200 border">
                              <ImageIcon className="w-4 h-4 text-gray-600" />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, url => updateCurrentSpread(s => {
                                if (s.type !== 'split' || s.right.type !== 'image') return s;
                                return { ...s, right: { ...s.right, url } };
                              }))} />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
