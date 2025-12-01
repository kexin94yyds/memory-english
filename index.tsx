import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { getWordLevel, levelToDifficulty } from './data/wordLists';
import { lookupWord } from './data/dictionary';
import { 
  BookOpen, 
  Youtube, 
  FileText, 
  ArrowRight, 
  Volume2, 
  Loader2,
  Sparkles,
  Layers,
  ChevronLeft,
  Undo2,
  ExternalLink,
  FileUp,
  Link as LinkIcon,
  PlayCircle,
  Clock,
  Highlighter,
  List
} from 'lucide-react';

// --- Types ---

type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

interface VocabWord {
  word: string;
  partOfSpeech: string;
  phonetic: string;
  definition: string;
  contextSentence: string;
  translation: string;
  difficulty: Difficulty;
}

interface ScriptSegment {
  timestamp: string;
  text: string;
}

interface AnalysisResult {
  title: string;
  summary: string;
  sourceUrl?: string;
  sourceType?: 'youtube' | 'web' | 'text';
  script: ScriptSegment[];
  vocabulary: VocabWord[];
}

type AppState = 'input' | 'processing' | 'dashboard' | 'learning';
type InputType = 'text' | 'url' | 'file';

// --- Helpers ---

const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// --- Components ---

const App = () => {
  const [appState, setAppState] = useState<AppState>('input');
  const [inputText, setInputText] = useState('');
  const [inputType, setInputType] = useState<InputType>('text');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [learningQueue, setLearningQueue] = useState<VocabWord[]>([]);
  const [error, setError] = useState<string | null>(null);

  // --- API Logic ---

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    
    setAppState('processing');
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const isUrl = inputType === 'url';
      const youtubeId = isUrl ? getYouTubeId(inputText) : null;
      
      const prompt = `
        You are an expert language tutor.
        
        Input (original user content, may be article text, transcript text, or extracted text from a URL):
        "${inputText.slice(0, 30000)}"
        Type: ${isUrl ? 'URL (Infer content)' : 'Raw Text'}
        
        Tasks:
        1. **Vocab Extraction**: Identify key English words for learning (CEFR A1-C2). Extract as many useful words as possible.
           - Filter out extremely basic stopwords (e.g., "the", "and", "is") unless they are used in a unique idiomatic way.
        2. **Context from ORIGINAL TEXT**:
           - For each word, choose ONE sentence that actually appears in the original input text.
           - The sentence must be copied verbatim from the input (do NOT invent new sentences).
           - The sentence should contain the target word and provide clear context.
        3. **Chinese-friendly output**:
           - Use concise Chinese for definitions and translations.
        
        Output JSON schema:
        {
          title: "Title of the content (can be inferred)",
          summary: "Short summary in Chinese",
          script: [],
          vocabulary: [ ...word objects... ]
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              script: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    timestamp: { type: Type.STRING },
                    text: { type: Type.STRING }
                  }
                }
              },
              vocabulary: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    partOfSpeech: { type: Type.STRING },
                    phonetic: { type: Type.STRING },
                    definition: { type: Type.STRING },
                    contextSentence: { type: Type.STRING },
                    translation: { type: Type.STRING },
                    difficulty: { type: Type.STRING, enum: ['Beginner', 'Intermediate', 'Advanced'] }
                  },
                  required: ['word', 'partOfSpeech', 'phonetic', 'definition', 'contextSentence', 'translation', 'difficulty']
                }
              }
            }
          }
        }
      });

      if (response.text) {
        const result = JSON.parse(response.text) as AnalysisResult;
        
        // 使用本地词表重新分级（覆盖 AI 返回的 difficulty）
        result.vocabulary = result.vocabulary.map(word => {
          const level = getWordLevel(word.word);
          return {
            ...word,
            difficulty: levelToDifficulty(level)
          };
        });
        
        if (isUrl) {
            result.sourceUrl = inputText;
            result.sourceType = youtubeId ? 'youtube' : 'web';
        } else {
            result.sourceType = 'text';
        }
        setAnalysisResult(result);
        setAppState('dashboard');
      } else {
        throw new Error("No response from AI");
      }

    } catch (e: any) {
      console.error(e);
      setError("Analysis failed. Please try again. " + e.message);
      setAppState('input');
    }
  };

  const startLearning = (level: Difficulty | 'All') => {
    if (!analysisResult) return;
    
    const filtered = level === 'All' 
      ? analysisResult.vocabulary 
      : analysisResult.vocabulary.filter(w => w.difficulty === level);
    
    if (filtered.length === 0) {
      alert("No words found for this level.");
      return;
    }

    setLearningQueue(filtered);
    setAppState('learning');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 max-w-2xl mx-auto w-full relative bg-[#FDFDFD] font-sans text-slate-800">
      <div className="absolute top-6 left-6 flex items-center gap-2 text-indigo-900 font-bold text-lg select-none z-20 cursor-pointer" onClick={() => setAppState('input')}>
        <BookOpen className="w-6 h-6 text-indigo-600" />
        <span className="tracking-tight">ContextVocab</span>
      </div>

      {appState === 'input' && (
        <InputSection 
          inputText={inputText} 
          setInputText={setInputText}
          inputType={inputType}
          setInputType={setInputType}
          onAnalyze={handleAnalyze} 
        />
      )}

      {appState === 'processing' && (
        <div className="flex flex-col items-center animate-in fade-in duration-700">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin relative z-10" />
          </div>
          <p className="text-slate-600 font-medium mt-8 tracking-wide">Analyzing Content...</p>
        </div>
      )}

      {appState === 'dashboard' && analysisResult && (
        <Dashboard 
          result={analysisResult} 
          onStart={startLearning}
          onBack={() => setAppState('input')}
        />
      )}

      {appState === 'learning' && analysisResult && (
        <div className="w-full max-w-md">
             <LearningSession 
                queue={learningQueue} 
                result={analysisResult}
                onFinish={() => setAppState('dashboard')}
            />
        </div>
      )}
      
      {error && (
        <div className="fixed bottom-6 left-4 right-4 bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl text-sm shadow-xl text-center animate-in slide-in-from-bottom-4 z-50 max-w-md mx-auto">
          {error}
          <button onClick={() => setError(null)} className="ml-3 font-bold underline">Dismiss</button>
        </div>
      )}
    </div>
  );
};

// --- Sub-Components ---

const InputSection = ({ inputText, setInputText, inputType, setInputType, onAnalyze }: {
    inputText: string;
    setInputText: (s: string) => void;
    inputType: InputType;
    setInputType: (t: InputType) => void;
    onAnalyze: () => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setInputText(text);
        setInputType('text'); // Switch to text view to show imported content
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 mt-12">
      <div className="space-y-2 text-center mb-10">
        <h1 className="text-4xl font-serif text-slate-900 tracking-tight">Immersion Reader</h1>
        <p className="text-slate-400 text-sm">
            Import content, read transcripts, and master vocabulary in context.
        </p>
      </div>

      <div className="flex gap-4 justify-center mb-2">
        <button 
          onClick={() => setInputType('text')}
          className={`flex flex-col items-center justify-center w-24 h-20 rounded-2xl border transition-all ${inputType === 'text' ? 'bg-white border-indigo-500 text-indigo-600 shadow-md ring-1 ring-indigo-100' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
        >
          <FileText className="w-6 h-6 mb-2" />
          <span className="text-xs font-medium">Text</span>
        </button>
        
        <button 
           onClick={() => setInputType('url')}
           className={`flex flex-col items-center justify-center w-24 h-20 rounded-2xl border transition-all ${inputType === 'url' ? 'bg-white border-indigo-500 text-indigo-600 shadow-md ring-1 ring-indigo-100' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
        >
          <LinkIcon className="w-6 h-6 mb-2" />
          <span className="text-xs font-medium">Link / URL</span>
        </button>

        <button 
           onClick={() => setInputType('file')}
           className={`flex flex-col items-center justify-center w-24 h-20 rounded-2xl border transition-all ${inputType === 'file' ? 'bg-white border-indigo-500 text-indigo-600 shadow-md ring-1 ring-indigo-100' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
        >
          <FileUp className="w-6 h-6 mb-2" />
          <span className="text-xs font-medium">Upload</span>
        </button>
      </div>

      <div className="relative">
        {inputType === 'file' ? (
           <div 
             className={`w-full h-64 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-center p-6 transition-all ${isDragging ? 'border-indigo-600 bg-indigo-50 scale-[1.02]' : 'border-indigo-300 bg-indigo-50/30'}`}
             onDragOver={handleDragOver}
             onDragLeave={handleDragLeave}
             onDrop={handleDrop}
           >
              <div className="w-16 h-16 bg-[#6384BD] rounded-lg flex items-center justify-center text-white mb-6 shadow-sm">
                  <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-slate-800 font-bold text-lg mb-2">Drag and drop the ebook you want to read here!</h3>
              <div className="flex flex-col gap-2 mt-2">
                 <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="text-indigo-600 font-semibold underline hover:text-indigo-800"
                 >
                    Open File
                 </button>
                 <span className="text-xs text-slate-400 mt-2">Supports .txt, .md, .srt</span>
              </div>
              <input 
                 ref={fileInputRef}
                 type="file" 
                 accept=".txt,.md,.srt" 
                 className="hidden" 
                 onChange={handleFileUpload} 
              />
           </div>
        ) : (
            <div className="relative h-64">
                <textarea
                className="w-full h-full p-4 rounded-2xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 resize-none shadow-sm text-base transition-all"
                placeholder={inputType === 'text' ? "Paste any text here..." : "Paste YouTube or Article URL here..."}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                />
                {inputType === 'url' && inputText.includes('youtube') && (
                    <div className="absolute bottom-4 right-4 text-red-500 animate-pulse">
                        <Youtube className="w-5 h-5" />
                    </div>
                )}
            </div>
        )}
      </div>

      <button
        onClick={onAnalyze}
        disabled={!inputText.trim()}
        className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-4 rounded-2xl shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        <Sparkles className="w-4 h-4 text-indigo-300" />
        Analyze & Read
      </button>
    </div>
  );
};

const Dashboard = ({ result, onStart, onBack }: { result: AnalysisResult, onStart: (l: any) => void, onBack: () => void }) => {
  return (
    <div className="w-full max-w-xl flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">
      
      {/* Header Card */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden">
         <div className="relative z-10">
             <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                    <h2 className="text-2xl font-serif font-bold text-slate-900 leading-tight mb-2 line-clamp-2">{result.title || "Content Analysis"}</h2>
                    <p className="text-slate-500 text-sm line-clamp-3">{result.summary}</p>
                </div>
                {result.sourceType === 'youtube' && (
                     <div className="p-3 bg-red-50 text-red-600 rounded-2xl ml-4">
                         <Youtube className="w-6 h-6" />
                     </div>
                 )}
             </div>
             
             <div className="flex items-center gap-4 text-xs font-medium text-slate-400 mt-2">
                 <span className="flex items-center gap-1"><List className="w-3 h-3" /> {result.vocabulary.length} words found</span>
                 {result.sourceUrl && (
                     <a href={result.sourceUrl} target="_blank" className="flex items-center gap-1 text-indigo-500 hover:underline">
                         <ExternalLink className="w-3 h-3" /> Source
                     </a>
                 )}
             </div>
         </div>
      </div>

      {/* Vocabulary List Preview */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-64 md:h-auto">
          <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
             <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Vocabulary Preview</h3>
          </div>
          <div className="overflow-y-auto p-2 custom-scrollbar flex-1">
             {result.vocabulary.map((word, idx) => (
                 <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors group">
                     <div className="flex items-center gap-3">
                         <div className={`w-2 h-2 rounded-full ${
                             word.difficulty === 'Beginner' ? 'bg-green-400' :
                             word.difficulty === 'Intermediate' ? 'bg-blue-400' : 'bg-orange-400'
                         }`} />
                         <div>
                             <p className="font-bold text-slate-800">{word.word}</p>
                             <p className="text-xs text-slate-400 italic">{word.partOfSpeech}</p>
                         </div>
                     </div>
                     <span className="text-sm text-slate-600 font-serif serif-cn">{word.translation}</span>
                 </div>
             ))}
          </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
         {['Beginner', 'Intermediate', 'Advanced'].map((level) => {
             const count = result.vocabulary.filter(w => w.difficulty === level).length;
             return (
                 <button 
                    key={level}
                    onClick={() => onStart(level)}
                    disabled={count === 0}
                    className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-100 bg-white hover:border-indigo-300 hover:shadow-md transition-all disabled:opacity-50 disabled:hover:shadow-none disabled:hover:border-slate-100"
                 >
                    <span className="font-medium text-slate-700 text-sm mb-1">{level}</span>
                    <span className="text-xs font-bold bg-slate-100 px-2 py-0.5 rounded-md text-slate-500">{count}</span>
                 </button>
             );
         })}
         <button 
            onClick={() => onStart('All')}
            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition-all"
         >
            <span className="font-bold text-sm mb-1">Start All</span>
            <Layers className="w-4 h-4 text-indigo-200" />
         </button>
      </div>

      <button onClick={onBack} className="w-full py-2 text-sm text-slate-400 font-medium hover:text-slate-600 transition-colors">
          Analyze Different Content
      </button>

    </div>
  );
};

const LearningSession = ({ queue, result, onFinish }: { queue: VocabWord[], result: AnalysisResult, onFinish: () => void }) => {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]); 
  const currentWord = queue[index];

  const handleNext = () => {
    if (index < queue.length - 1) {
      setHistory(prev => [...prev, index]);
      setIndex(prev => prev + 1);
    } else {
      onFinish();
    }
  };

  const handlePrev = () => {
    if (history.length > 0) {
      const prevIndex = history[history.length - 1];
      setIndex(prevIndex);
      setHistory(prev => prev.slice(0, -1));
    }
  };

  if (!currentWord) return null;

  return (
    <div className="w-full h-[80vh] flex flex-col relative animate-in fade-in duration-500 mt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button 
          onClick={handlePrev} 
          disabled={history.length === 0}
          className={`p-2 rounded-full ${history.length === 0 ? 'text-slate-200' : 'text-slate-600 hover:bg-white'} transition-all`}
        >
          <Undo2 className="w-5 h-5" />
        </button>
        
        <div className="flex gap-1">
            {queue.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === index ? 'w-4 bg-indigo-500' : i < index ? 'w-1 bg-indigo-200' : 'w-1 bg-slate-200'}`} />
            ))}
        </div>

        <button onClick={onFinish} className="text-xs font-bold text-slate-400 hover:text-slate-600">
          EXIT
        </button>
      </div>

      <div className="flex-1 relative perspective-1000 mb-4">
         <div className="absolute inset-0 bg-white rounded-[2rem] shadow-sm border border-slate-100 transform translate-y-2 scale-95 opacity-50 z-0" />
         
         <FlashCard 
           key={currentWord.word} 
           word={currentWord} 
           sourceUrl={result.sourceUrl}
           sourceType={result.sourceType}
           onGotIt={handleNext} 
           onForgot={handleNext}
         />
      </div>

      <div className="text-center text-xs text-slate-300 font-medium">
        Swipe or use Arrow Keys
      </div>
    </div>
  );
};

const FlashCard: React.FC<{ word: VocabWord, sourceUrl?: string, sourceType?: string, onGotIt: () => void, onForgot: () => void }> = ({ word, sourceUrl, sourceType, onGotIt, onForgot }) => {
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Extract video ID for thumbnail background
  const youtubeId = (sourceType === 'youtube' && sourceUrl) ? getYouTubeId(sourceUrl) : null;

  const playAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleSwipe('right');
      if (e.key === 'ArrowLeft') handleSwipe('left');
      if (e.code === 'Space') setFlipped(prev => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); 

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    startX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    setDragX(currentX - startX.current);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (Math.abs(dragX) > 100) {
      handleSwipe(dragX > 0 ? 'right' : 'left');
    } else {
      setDragX(0); 
    }
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    const endX = direction === 'right' ? 500 : -500;
    setDragX(endX);
    setTimeout(() => {
        if (direction === 'right') onGotIt();
        else onForgot();
    }, 200);
  };

  const rotation = dragX * 0.05;
  const opacity = 1 - Math.abs(dragX) / 600;
  const overlayColor = dragX > 0 ? 'rgba(99, 102, 241, 0.1)' : 'rgba(239, 68, 68, 0.1)'; 
  const overlayOpacity = Math.min(Math.abs(dragX) / 200, 1);

  return (
    <div className="w-full h-full relative z-10">
       <div 
        ref={cardRef}
        className="w-full h-full bg-white rounded-[2rem] shadow-2xl shadow-slate-200/60 border border-white flex flex-col justify-between overflow-hidden relative"
        style={{ 
            transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
            opacity: opacity,
            transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s'
        }}
        onClick={() => setFlipped(!flipped)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div 
            className="absolute inset-0 pointer-events-none z-10 transition-colors"
            style={{ backgroundColor: overlayColor, opacity: overlayOpacity }}
        />

        {/* --- FRONT --- */}
        <div className={`absolute inset-0 p-8 flex flex-col items-center justify-center transition-all duration-500 ${flipped ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
          
          {/* Subtle Video Background Hint */}
          {youtubeId && (
            <div className="absolute top-0 left-0 right-0 h-32 opacity-10 pointer-events-none mask-image-gradient">
                <img src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="absolute top-8 left-8">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border ${
              word.difficulty === 'Beginner' ? 'bg-green-50 text-green-700 border-green-100' :
              word.difficulty === 'Intermediate' ? 'bg-blue-50 text-blue-700 border-blue-100' :
              'bg-orange-50 text-orange-700 border-orange-100'
            }`}>
              {word.difficulty}
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center w-full mt-8">
            <h2 className="text-5xl font-bold text-slate-800 mb-5 tracking-tight text-center leading-tight">{word.word}</h2>
            
            <div className="flex items-center gap-4 text-slate-400 mb-12">
                <span className="font-serif italic text-lg text-slate-500">{word.partOfSpeech}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span className="text-lg font-mono tracking-tighter">{word.phonetic}</span>
                <button 
                    onClick={playAudio}
                    className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-full transition-all active:scale-90 ml-2"
                >
                    <Volume2 className="w-5 h-5" />
                </button>
            </div>

            <div className="w-full bg-slate-50/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-100 relative group cursor-pointer transition-all hover:bg-slate-50">
                <p className="text-slate-800 text-lg leading-relaxed text-center filter blur-[4px] group-hover:blur-none transition-all duration-500 select-none">
                    {word.contextSentence}
                </p>
                <div className="absolute inset-0 flex items-center justify-center group-hover:opacity-0 transition-opacity duration-300">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-200 px-3 py-1 rounded-full bg-white/80 shadow-sm">
                        Tap to reveal context
                    </span>
                </div>
            </div>
          </div>
          
          <div className="w-full pt-6 border-t border-slate-50 flex justify-between items-center text-slate-300 text-[10px] font-bold uppercase tracking-widest">
            <span>Tap to flip</span>
            {sourceType === 'youtube' && <span className="flex items-center text-red-300"><Youtube className="w-3 h-3 mr-1"/> Video Context</span>}
          </div>
        </div>

        {/* --- BACK --- */}
        <div className={`absolute inset-0 p-8 flex flex-col transition-all duration-500 ${flipped ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'}`}>
           <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-3xl font-bold text-slate-800">{word.word}</h2>
                <div className="flex items-center gap-2 text-slate-400 text-sm mt-1 font-mono">
                    <span>{word.phonetic}</span>
                </div>
              </div>
              <button onClick={playAudio} className="p-2 bg-slate-50 rounded-full text-slate-600 hover:bg-slate-100">
                 <Volume2 className="w-5 h-5" />
              </button>
           </div>

           <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
               <div className="mb-8">
                   <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-3">Definition</h3>
                   <p className="text-xl text-slate-800 font-serif serif-cn leading-relaxed">{word.definition}</p>
               </div>

               <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-50 mb-8">
                    <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-3">Context</h3>
                    <p className="text-slate-800 text-lg leading-relaxed font-medium">
                        {word.contextSentence.split(new RegExp(`(${word.word})`, 'gi')).map((part, i) => 
                            part.toLowerCase() === word.word.toLowerCase() 
                            ? <span key={i} className="text-indigo-600 bg-white shadow-sm px-1.5 py-0.5 rounded-md -mx-1 relative bottom-[1px]">{part}</span> 
                            : part
                        )}
                    </p>
                    <p className="text-slate-500 mt-4 text-sm serif-cn pt-4 border-t border-indigo-100">
                        {word.translation}
                    </p>
               </div>

               {sourceUrl && (
                   <div className="text-center pb-4">
                       <a 
                         href={sourceUrl} 
                         target="_blank" 
                         rel="noreferrer"
                         onClick={(e) => e.stopPropagation()}
                         className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-600 hover:text-indigo-800 py-3 px-6 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-colors"
                       >
                           {sourceType === 'youtube' ? <Youtube className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                           {sourceType === 'youtube' ? 'Watch Video' : 'Read Source'}
                       </a>
                   </div>
               )}
           </div>

           {/* Controls */}
           <div className="pt-4 mt-auto flex gap-4">
                <button 
                    onClick={(e) => { e.stopPropagation(); handleSwipe('left'); }}
                    className="flex-1 py-4 rounded-xl border-2 border-red-50 bg-white text-red-400 font-bold text-xs tracking-widest hover:bg-red-50 hover:text-red-600 active:scale-95 transition-all"
                >
                    FORGOT
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleSwipe('right'); }}
                    className="flex-1 py-4 rounded-xl bg-indigo-600 text-white font-bold text-xs tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all"
                >
                    GOT IT
                </button>
           </div>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);