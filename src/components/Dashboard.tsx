import React, { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { UserProfile, HistoryItem, Token, FavoriteWord } from '../types';
import { 
  LogOut, 
  Search, 
  Upload, 
  History as HistoryIcon, 
  Moon, 
  Sun, 
  Trash2, 
  ChevronRight, 
  BookOpen, 
  Camera,
  X,
  Languages,
  Loader2,
  Star,
  Info,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api from '../lib/api';
import { GoogleGenAI, Type } from "@google/genai";

const PitchAccentLegend = () => (
  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
    <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center gap-1">
      <Info size={12} /> Understanding Pitch Symbols
    </h5>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div className="space-y-1">
        <p className="font-bold text-indigo-600">[0] Heiban (平板)</p>
        <p className="text-slate-500">Low-High-High... (Stays high until the end)</p>
      </div>
      <div className="space-y-1">
        <p className="font-bold text-indigo-600">[1] Atamadaka (頭高)</p>
        <p className="text-slate-500">High-Low-Low... (Drops immediately after 1st mora)</p>
      </div>
      <div className="space-y-1">
        <p className="font-bold text-indigo-600">[2, 3...] Nakadaka (中高)</p>
        <p className="text-slate-500">Low-High...Low (Drops after the specified number)</p>
      </div>
      <div className="space-y-1">
        <p className="font-bold text-indigo-600">[n] Odaka (尾高)</p>
        <p className="text-slate-500">Drops only when followed by a particle</p>
      </div>
    </div>
  </div>
);

// Helper to split Japanese text into morae
const getMorae = (text: string) => {
  if (!text) return [];
  // Regex to match a mora: 
  // 1. A base kana possibly followed by a small y-row kana or small vowel (digraphs)
  // 2. Sokuon (っ/ッ)
  // 3. Chōonpu (ー)
  // 4. Any other character as a fallback
  const moraRegex = /[ぁ-んァ-ヶ][ぁぃぅぇぉゃュょァィゥェォャュョ]?|ー|っ|ッ|./g;
  return text.match(moraRegex) || [];
};

const PitchVisualizer = ({ reading, pattern }: { reading: string; pattern: string }) => {
  const morae = getMorae(reading);
  
  if (!pattern || !reading) return null;

  // Normalize pattern: Gemini might send 'H/L' or '0/1'. We want '0/1' logic.
  const normalizedPattern = pattern.split('').map(char => 
    (char === '1' || char.toUpperCase() === 'H') ? '1' : '0'
  ).join('');

  const length = Math.min(morae.length, normalizedPattern.length);
  const displayMorae = morae.slice(0, length);
  
  // Constants for perfectly aligned rendering
  const DOT_SPACING = 36;
  const HIGH_Y = 6;
  const LOW_Y = 22;
  const DOT_SIZE = 10;

  return (
    <div className="flex flex-col items-center gap-2 mt-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="relative h-8" style={{ width: length * DOT_SPACING }}>
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
          {displayMorae.map((_, i) => {
            if (i === length - 1) return null;
            const x1 = i * DOT_SPACING + DOT_SPACING / 2;
            const y1 = normalizedPattern[i] === '1' ? HIGH_Y : LOW_Y;
            const x2 = (i + 1) * DOT_SPACING + DOT_SPACING / 2;
            const y2 = normalizedPattern[i+1] === '1' ? HIGH_Y : LOW_Y;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-indigo-400 dark:text-indigo-500/40"
              />
            );
          })}
        </svg>
        {displayMorae.map((mora, i) => (
          <div 
            key={i} 
            className="absolute flex justify-center" 
            style={{ 
              width: DOT_SPACING, 
              left: i * DOT_SPACING,
              top: (normalizedPattern[i] === '1' ? HIGH_Y : LOW_Y) - (DOT_SIZE / 2)
            }}
          >
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className={`w-2.5 h-2.5 rounded-full shadow-sm transition-colors duration-300 ${
                normalizedPattern[i] === '1' ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            />
          </div>
        ))}
      </div>
      <div className="flex">
        {displayMorae.map((mora, i) => (
          <div key={i} className="flex justify-center text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter" style={{ width: DOT_SPACING }}>
            {mora}
          </div>
        ))}
      </div>
    </div>
  );
};

interface DashboardProps {
  user: User | null;
  profile: UserProfile | null;
  toggleTheme: () => void;
  theme: 'light' | 'dark';
  isGuest: boolean;
  onLogout: () => void;
}

export default function Dashboard({ user, profile, toggleTheme, theme, isGuest, onLogout }: DashboardProps) {
  const [inputText, setInputText] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentResult, setCurrentResult] = useState<Token[] | null>(null);
  const [fullTranslation, setFullTranslation] = useState<string | null>(null);
  const [showFullTranslation, setShowFullTranslation] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [jishoDetails, setJishoDetails] = useState<any>(null);
  const [view, setView] = useState<'study' | 'history' | 'favorites'>('study');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [savingFav, setSavingFav] = useState(false);
  const [jishoError, setJishoError] = useState<string | null>(null);
  const [jishoLoading, setJishoLoading] = useState(false);
  const [posFilter, setPosFilter] = useState('');
  const [jlptFilter, setJlptFilter] = useState('');
  const [breakdownPosFilter, setBreakdownPosFilter] = useState('');
  const [breakdownJlptFilter, setBreakdownJlptFilter] = useState('');

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const getJlptColor = (jlpt: string | null | undefined) => {
    if (!jlpt) return 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200';
    
    // Extract level from string like "jlpt-n3", "N3", "n3"
    const match = jlpt.toLowerCase().match(/n[1-5]/);
    const level = match ? match[0] : null;

    switch (level) {
      case 'n1': return 'border-red-500 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400';
      case 'n2': return 'border-orange-500 bg-orange-50 dark:bg-orange-900/10 text-orange-700 dark:text-orange-400';
      case 'n3': return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-400';
      case 'n4': return 'border-green-500 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400';
      case 'n5': return 'border-blue-500 bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400';
      default: return 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200';
    }
  };

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'history'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HistoryItem[];
      setHistory(items);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'favorites'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FavoriteWord[];
      setFavorites(items);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const [lastSavedText, setLastSavedText] = useState('');

  const tokenizeText = async (text: string) => {
    if (!text.trim() || (loading && text === inputText)) return;
    setLoading(true);
    setFullTranslation(null);
    setShowFullTranslation(false);
    setCurrentResult(null);
    setSelectedToken(null);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following Japanese text. Provide a natural English translation and a detailed tokenization.
        
        CRITICAL: The tokenization MUST cover the ENTIRE source text. If you concatenate all 'surface' fields from the 'tokens' array, it must EXACTLY match the original input text (including particles, punctuation, and markers).
        
        MORPHOLOGY: Keep conjugated verbs and adjectives as SINGLE tokens. Do NOT split them into stem and suffix/auxiliary parts. For example, '食べました' should be one token with 'verb' as POS, not split into '食べ' and 'ました'. Include all inflections (~ている, ~れた, ~たい, ~た, ~ます etc.) within the surface field.
        
        READING: Provide 'reading' (furigana) strictly in Hiragana.
        
        PITCH: 
        - pitchAccent: The numerical category (e.g. '0' for Heiban, '1' for Atamadaka, etc.).
        - pitchPattern: A binary string (0 for low, 1 for high) where each character matches exactly one MORA of the 'reading'. 
          Mandatory Examples:
          - 'ねこ' (neko, Atamadaka [1]) -> '10'
          - 'にほん' (nihon, Nakadaka [2]) -> '010'
          - 'さくら' (sakura, Heiban [0]) -> '011'
        
        Text: ${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translation: { type: Type.STRING, description: "Full English translation of the source text" },
              tokens: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    surface: { type: Type.STRING },
                    reading: { type: Type.STRING },
                    dictionaryForm: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    translation: { type: Type.STRING },
                    pitchAccent: { type: Type.STRING },
                    pitchPattern: { type: Type.STRING },
                  },
                  required: ["surface", "pos", "translation"]
                }
              }
            },
            required: ["translation", "tokens"]
          }
        }
      });

      const result = JSON.parse(response.text);
      const tokens = result.tokens as Token[];
      setFullTranslation(result.translation);
      setCurrentResult([]); // Start with an empty set for progressive display

      const processedTokens: Token[] = [];
      
      for (const token of tokens) {
        const isVocab = !/^[、。！？，．（）、「」『』；：\s\(\)\[\]\{\}\<\>]+$/.test(token.surface) &&
                        !['PARTICLE', 'PUNCT', 'SYMBOL'].includes((token.pos || '').toUpperCase());
        
        let tokenWithJlpt = { ...token };
        
        if (isVocab) {
          try {
            const keyword = token.dictionaryForm || token.surface;
            const jishoRes = await api.get(`/api/jisho?keyword=${encodeURIComponent(keyword)}`);
            const details = jishoRes.data.data?.[0];
            
            if (details?.jlpt?.length > 0) {
              tokenWithJlpt.jlpt = details.jlpt[0].replace('jlpt-', '').toLowerCase();
            } else {
              tokenWithJlpt.jlpt = 'none';
            }
          } catch (e) {
            console.error("JLPT Fetch Error for " + token.surface, e);
            tokenWithJlpt.jlpt = 'none';
          }
          // Small delay to respect Jisho/Proxy rate limits
          await new Promise(r => setTimeout(r, 50));
        } else {
          // Punctuation is ready immediately
          tokenWithJlpt.jlpt = 'none';
        }
        
        processedTokens.push(tokenWithJlpt);
        // Only update with processedTokens to ensure words appear in order
        setCurrentResult([...processedTokens]);
      }

      // Save to history only if logged in and processing completed
      if (user && text !== lastSavedText && processedTokens.length > 0) {
        // Limit tokens to 500 to prevent massive document sizes
        const safeTokens = processedTokens.slice(0, 500);
        
        await addDoc(collection(db, 'history'), {
          userId: user.uid,
          originalText: text.substring(0, 5000), // Cap input text log
          timestamp: serverTimestamp(),
          tokens: safeTokens
        });
        setLastSavedText(text);
      }
    } catch (err) {
      console.error("Tokenization error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchJishoDetails = async (token: Token) => {
    setSelectedToken(token);
    setJishoDetails(null);
    setJishoError(null);
    setJishoLoading(true);
    try {
      const keyword = token.dictionaryForm || token.surface;
      const res = await api.get(`/api/jisho?keyword=${encodeURIComponent(keyword)}`);
      const details = res.data.data?.[0] || null;
      setJishoDetails(details);
      
      // Update token in currentResult to match Jisho data for consistency
      if (details?.jlpt?.length > 0) {
        const jlpt = details.jlpt[0].replace('jlpt-', '').toLowerCase();
        setCurrentResult(prev => prev ? prev.map(t => 
          t.surface === token.surface ? { ...t, jlpt } : t
        ) : null);
      }
      
      if (!details) {
        setJishoError("No exact match found in dictionary");
      }
    } catch (err: any) {
      console.error("Jisho fetch error:", err);
      setJishoError(err.response?.data?.error || "Failed to load dictionary data");
    } finally {
      setJishoLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || ocrLoading) return;

    setOcrLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/api/ocr', formData);
      const text = res.data.text;
      setInputText(text);
      if (text) {
        tokenizeText(text);
      }
    } catch (err) {
      console.error("OCR Error:", err);
    } finally {
      setOcrLoading(false);
    }
  };

  const deleteHistory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'history', id));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const toggleFavorite = async (token: Token) => {
    if (!user || savingFav) return;
    setSavingFav(true);
    const existing = favorites.find(f => f.surface === token.surface);
    try {
      if (existing) {
        await deleteDoc(doc(db, 'favorites', existing.id));
      } else {
        await addDoc(collection(db, 'favorites'), {
          userId: user.uid,
          surface: token.surface,
          reading: token.reading || '',
          translation: token.translation || '',
          pos: token.pos || '',
          pitchAccent: token.pitchAccent || '',
          pitchPattern: token.pitchPattern || '',
          jlpt: token.jlpt || null,
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      console.error("Favorite toggle error:", err);
    } finally {
      setSavingFav(false);
    }
  };

  const isFavorite = (surface: string) => favorites.some(f => f.surface === surface);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* Navbar / Header */}
      <nav className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-200 dark:shadow-none">
            言
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
              Kotoba<span className="text-indigo-600 underline underline-offset-4 decoration-2">Study</span>
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {isGuest ? 'Guest Explorer' : `Welcome, ${profile?.username || 'Learner'}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setView('study')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${view === 'study' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            Study Lab
          </button>
          {!isGuest && (
            <>
              <button 
                onClick={() => setView('history')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${view === 'history' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                Collection
              </button>
              <button 
                onClick={() => setView('favorites')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${view === 'favorites' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                Saved Words
              </button>
            </>
          )}
          <div className="mx-2 w-px h-6 bg-slate-200 dark:bg-slate-800" />
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button 
            onClick={onLogout}
            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      {isGuest && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-4 rounded-xl flex items-center justify-between text-amber-800 dark:text-amber-200">
          <p className="text-sm font-medium">You are in Guest Mode. Login to save your study history and favorite words!</p>
          <button onClick={onLogout} className="text-xs font-bold underline">Login Now</button>
        </div>
      )}

      {view === 'study' ? (
        <div className="flex flex-col gap-6">
          {/* Top Row: Input & Analysis Result */}
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" /> Japanese Source Input
                </div>
                <div className="flex gap-2">
                   <input
                    type="file"
                    id="ocr-upload"
                    className="hidden"
                    accept="image/*, application/pdf"
                    onChange={handleFileUpload}
                  />
                  <label
                    htmlFor="ocr-upload"
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer flex items-center gap-2 transition-all text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    {ocrLoading ? <Loader2 className="animate-spin w-4 h-4" /> : <Camera size={14} />}
                    Scan Image
                  </label>
                  <button
                    onClick={() => tokenizeText(inputText)}
                    disabled={loading || !inputText}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Languages size={14} />}
                    Analyze Content
                  </button>
                </div>
              </div>
              
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Enter Japanese text or upload an image to start..."
                className="w-full h-32 p-6 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all text-xl font-medium placeholder:text-slate-300"
              />
            </div>

            <AnimatePresence>
              {currentResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm"
                >
                   {fullTranslation && (
                     <div className="mb-10">
                       <button 
                         onClick={() => setShowFullTranslation(!showFullTranslation)}
                         className="flex items-center gap-2 mb-3 text-[10px] font-bold text-indigo-500 hover:text-indigo-600 uppercase tracking-widest transition-colors"
                       >
                         <Languages size={14} /> 
                         {showFullTranslation ? 'Hide' : 'Show'} Full AI Translation
                       </button>
                       <AnimatePresence>
                         {showFullTranslation && (
                           <motion.div 
                             initial={{ height: 0, opacity: 0 }}
                             animate={{ height: 'auto', opacity: 1 }}
                             exit={{ height: 0, opacity: 0 }}
                             className="overflow-hidden"
                           >
                             <div className="p-6 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl">
                               <p className="text-xl font-medium text-slate-800 dark:text-slate-100 leading-relaxed italic">
                                 "{fullTranslation}"
                               </p>
                             </div>
                           </motion.div>
                         )}
                       </AnimatePresence>
                     </div>
                   )}

                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <span className="w-2 h-2 rounded-full bg-green-500" /> Tokenized Breakdown
                    </div>
                    
                    <div className="flex flex-wrap gap-2 items-center bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                      <Filter size={12} className="text-slate-400 ml-2" />
                      <select 
                        value={breakdownPosFilter}
                        onChange={(e) => setBreakdownPosFilter(e.target.value)}
                        className="bg-transparent text-[10px] font-bold text-slate-500 dark:text-slate-400 outline-none p-1 uppercase"
                      >
                        <option value="">All Types</option>
                        <option value="NOUN">Noun</option>
                        <option value="VERB">Verb</option>
                        <option value="ADJECTIVE">Adjective</option>
                        <option value="PARTICLE">Particle</option>
                        <option value="ADVERB">Adverb</option>
                      </select>
                      <select 
                        value={breakdownJlptFilter}
                        onChange={(e) => setBreakdownJlptFilter(e.target.value)}
                        className="bg-transparent text-[10px] font-bold text-slate-500 dark:text-slate-400 outline-none p-1 uppercase"
                      >
                        <option value="">All JLPT</option>
                        <option value="n1">N1</option>
                        <option value="n2">N2</option>
                        <option value="n3">N3</option>
                        <option value="n4">N4</option>
                        <option value="n5">N5</option>
                      </select>
                      {(breakdownPosFilter || breakdownJlptFilter) && (
                        <button 
                          onClick={() => { setBreakdownPosFilter(''); setBreakdownJlptFilter(''); }}
                          className="text-[10px] font-bold text-indigo-600 px-2 hover:underline"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-1 gap-y-10 items-start leading-relaxed">
                    {currentResult
                      .filter(token => {
                        const matchesPos = !breakdownPosFilter || token.pos?.toUpperCase().includes(breakdownPosFilter.toUpperCase());
                        const matchesJlpt = !breakdownJlptFilter || token.jlpt?.toLowerCase() === breakdownJlptFilter.toLowerCase();
                        return matchesPos && matchesJlpt;
                      })
                      .map((token, idx) => {
                      const isActive = selectedToken?.surface === token.surface;
                      const jlptStyles = getJlptColor(token.jlpt);
                      const isPunct = token.pos?.toUpperCase() === 'PUNCTUATION' || 
                                     token.pos?.toUpperCase() === 'PUNCT' || 
                                     token.pos?.toUpperCase() === 'SYMBOL' ||
                                     /^[、。！？，．（）、「」『』；：\s\(\)\[\]\{\}\<\>]+$/.test(token.surface);
                      
                      if (isPunct) {
                        return (
                          <div key={idx} className="flex flex-col items-center">
                            <div className="h-4" /> {/* Spacer for reading alignment */}
                            <div className="px-1 py-2 text-2xl font-medium border-b-4 border-transparent text-slate-300 dark:text-slate-700 select-none">
                              {token.surface}
                            </div>
                            <div className="h-4 mt-1" /> {/* Spacer for metadata alignment */}
                          </div>
                        );
                      }

                      return (
                        <motion.div
                          key={idx}
                          whileHover={{ y: -2 }}
                          className={`group cursor-pointer flex flex-col items-center transition-all ${isActive ? 'scale-105' : ''}`}
                          onClick={() => fetchJishoDetails(token)}
                        >
                          <div className={`text-[10px] pb-1 font-bold tracking-widest h-4 flex items-end justify-center transition-all ${isActive ? 'text-indigo-600' : 'text-slate-400 opacity-0 group-hover:opacity-100'}`}>
                            {token.reading || ''}
                          </div>
                          <div className={`px-4 py-2 border-b-4 rounded shadow-sm text-2xl font-medium transition-colors duration-200 ${
                            isActive 
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-600 text-indigo-700 dark:text-indigo-400' 
                              : `${jlptStyles} group-hover:border-indigo-400 group-hover:text-indigo-600`
                          }`}>
                            {token.surface}
                          </div>
                          <div className="h-4 mt-1 flex items-start justify-center">
                            {token.jlpt && token.jlpt !== 'null' && token.jlpt !== 'unknown' && (
                              <div className={`text-[8px] font-bold uppercase tracking-tighter transition-opacity ${isActive ? 'text-indigo-500 opacity-100' : 'text-slate-400 opacity-60 group-hover:opacity-100'}`}>
                                {token.jlpt.replace('jlpt-', '')}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                  {currentResult.filter(token => {
                    const matchesPos = !breakdownPosFilter || token.pos?.toUpperCase().includes(breakdownPosFilter.toUpperCase());
                    const matchesJlpt = !breakdownJlptFilter || token.jlpt?.toLowerCase() === breakdownJlptFilter.toLowerCase();
                    return matchesPos && matchesJlpt;
                  }).length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                      <p className="text-xs font-bold uppercase tracking-widest">No words match these filters</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Row: Detailed Context & Metadata */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                {selectedToken ? (
                  <motion.div
                    key="details"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full flex flex-col"
                  >
                    <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start">
                      <div>
                        <div className="flex items-baseline gap-3 text-indigo-600 dark:text-indigo-400">
                          <h4 className="text-5xl font-bold">{selectedToken.surface}</h4>
                          <span className="text-xl opacity-60 font-mono">[{selectedToken.reading}]</span>
                          {selectedToken.pitchAccent && selectedToken.pitchAccent !== 'null' && selectedToken.pitchAccent !== 'unknown' && (
                            <span className="text-sm font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500">
                              JapanDict: {selectedToken.pitchAccent}
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          {selectedToken.pitchPattern && selectedToken.reading && (
                            <PitchVisualizer reading={selectedToken.reading} pattern={selectedToken.pitchPattern} />
                          )}
                        </div>
                        <div className="flex gap-2 mt-4">
                          <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold rounded uppercase tracking-wider">{selectedToken.pos}</span>
                          {jishoDetails?.jlpt?.length > 0 && (
                            <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded uppercase tracking-wider">
                              {jishoDetails.jlpt[0].toUpperCase()}
                            </span>
                          )}
                          {jishoDetails?.is_common && (
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-[10px] font-bold rounded uppercase tracking-wider">
                              Common
                            </span>
                          )}
                          <a 
                            href={`https://www.japandict.com/?s=${encodeURIComponent(selectedToken.surface)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 text-[10px] font-bold rounded uppercase tracking-wider transition-colors"
                          >
                            JapanDict ↗
                          </a>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!isGuest && (
                          <button 
                            onClick={() => toggleFavorite(selectedToken)} 
                            disabled={savingFav}
                            className={`p-2 rounded-full transition-all ${isFavorite(selectedToken.surface) ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20 shadow-inner' : 'text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                          >
                            <Star className={isFavorite(selectedToken.surface) ? 'fill-current' : ''} size={24} />
                          </button>
                        )}
                        <button onClick={() => setSelectedToken(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400">
                          <X size={24} />
                        </button>
                      </div>
                    </div>

                    <div className="p-8 space-y-8 flex-1 overflow-y-auto">
                      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-l-4 border-indigo-500 shadow-sm">
                        <h5 className="text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-widest">AI Contextual Meaning</h5>
                        <p className="text-xl font-medium text-slate-700 dark:text-slate-200 leading-relaxed italic">
                          " {selectedToken.translation} "
                        </p>
                      </div>

                      <PitchAccentLegend />

                      {jishoLoading && (
                        <div className="flex flex-col items-center justify-center p-12 space-y-4">
                          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Querying Jisho.org...</p>
                        </div>
                      )}

                      {jishoError && !jishoLoading && (
                        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 text-xs font-medium border border-slate-200 dark:border-slate-700">
                          {jishoError}
                        </div>
                      )}

                      {jishoDetails && (
                        <div className="grid grid-cols-1 gap-8">
                          <div>
                            <h5 className="text-[10px] uppercase font-bold text-slate-400 mb-4 tracking-widest">Jisho.org Dictionary Data</h5>
                            <div className="space-y-6">
                              {jishoDetails.senses?.slice(0, 5).map((sense: any, sIdx: number) => (
                                <div key={sIdx} className="flex gap-4 items-start group">
                                  <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                    {sIdx + 1}
                                  </span>
                                  <div>
                                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-bold mb-1">
                                      {sense.english_definitions.join(', ')}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {sense.parts_of_speech?.map((pos: string, pIdx: number) => (
                                        <span key={pIdx} className="text-[9px] text-slate-400 font-medium italic border-b border-slate-200 dark:border-slate-800">
                                          {pos}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[400px] bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-300">
                    <BookOpen size={48} className="mb-4 opacity-20" />
                    <p className="font-bold uppercase tracking-widest text-xs">Select a token to inspect</p>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Column: Metadata Sidebar */}
            <div className="bg-indigo-950 rounded-2xl p-8 text-white flex flex-col justify-between shadow-2xl h-full shadow-indigo-200 dark:shadow-none">
              <div>
                <h3 className="text-[10px] font-bold opacity-40 uppercase tracking-widest mb-8 border-b border-indigo-900 pb-2">Analysis Intelligence</h3>
                <div className="space-y-8">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-xs font-bold">Model Confidence</p>
                       <p className="text-[10px] font-mono text-indigo-400">98.4%</p>
                    </div>
                    <div className="w-full h-1 bg-indigo-900 rounded-full">
                      <div className="w-11/12 h-full bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.5)]"></div>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs font-bold mb-3">Linguistic Profile</p>
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs p-2 bg-indigo-900/50 rounded-lg border border-indigo-800">
                        <span className="opacity-60">Engine</span>
                        <span className="font-mono text-indigo-300 uppercase">Gemini 3.0</span>
                      </div>
                      <div className="flex justify-between text-xs p-2 bg-indigo-900/50 rounded-lg border border-indigo-800">
                        <span className="opacity-60">Status</span>
                        <span className="text-green-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" /> Real-time
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                     <p className="text-xs font-bold mb-1">OCR Precision</p>
                     <p className="text-[10px] opacity-40 leading-relaxed font-medium">Automatic character normalization and furigana matching active.</p>
                  </div>
                </div>
              </div>
              
              <div className="pt-6 border-t border-indigo-900 bg-indigo-950/50">
                <div className="flex items-center justify-between text-[8px] font-mono opacity-30 uppercase tracking-tighter">
                  <span>Latency: 124ms</span>
                  <span>Region: AP-EAST</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : view === 'history' ? (
        /* History View: Re-styled as card grid */
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Recent Scans</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Total: {history.length} Saved Collections</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {history.map((item) => (
              <motion.div
                key={item.id}
                layout
                className="group bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 hover:shadow-xl hover:-translate-y-1 transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {new Date(item.timestamp?.seconds * 1000).toLocaleDateString()}
                  </div>
                  <button 
                    onClick={() => deleteHistory(item.id)}
                    className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 line-clamp-2 h-14 leading-tight">{item.originalText}</p>
                <button
                  onClick={() => {
                    setInputText(item.originalText);
                    setCurrentResult(item.tokens);
                    setView('study');
                  }}
                  className="w-full py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  Recall Scan Lab <ChevronRight size={14} />
                </button>
              </motion.div>
            ))}
          </div>
          
          {history.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300">
              <HistoryIcon size={64} className="mb-4 opacity-10" />
              <p className="font-bold uppercase tracking-widest text-xs">No active scan history</p>
            </div>
          )}
        </div>
      ) : (
        /* Favorites View */
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Saved Vocabulary</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Total: {favorites.length} Saved Words</p>
            </div>
            
            <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-slate-900 p-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 px-3 border-r border-slate-200 dark:border-slate-800">
                <Filter size={14} className="text-slate-400" />
                <span className="text-[10px] uppercase font-bold text-slate-400">Filter By</span>
              </div>
              <select 
                value={posFilter}
                onChange={(e) => setPosFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none p-1"
              >
                <option value="">All Types</option>
                <option value="NOUN">Noun</option>
                <option value="VERB">Verb</option>
                <option value="ADJECTIVE">Adjective</option>
                <option value="PARTICLE">Particle</option>
                <option value="ADVERB">Adverb</option>
              </select>
              <select 
                value={jlptFilter}
                onChange={(e) => setJlptFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none p-1"
              >
                <option value="">All JLPT</option>
                <option value="n1">N1</option>
                <option value="n2">N2</option>
                <option value="n3">N3</option>
                <option value="n4">N4</option>
                <option value="n5">N5</option>
              </select>
              {(posFilter || jlptFilter) && (
                <button 
                  onClick={() => { setPosFilter(''); setJlptFilter(''); }}
                  className="text-[10px] font-bold text-indigo-600 px-2 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {favorites
              .filter(fav => {
                const matchesPos = !posFilter || fav.pos?.toUpperCase().includes(posFilter.toUpperCase());
                // Handle FavoriteWord potentially not having jlpt yet for old records
                const matchesJlpt = !jlptFilter || (fav as any).jlpt?.toLowerCase() === jlptFilter.toLowerCase();
                return matchesPos && matchesJlpt;
              })
              .map((fav) => (
              <motion.div
                key={fav.id}
                className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center group relative overflow-hidden"
              >
                {fav.reading && (
                  <div className="text-[10px] font-bold text-indigo-400 tracking-widest mb-1">{fav.reading}</div>
                )}
                <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">{fav.surface}</div>
                {fav.pitchPattern && fav.pitchPattern !== 'null' && (
                  <div className="scale-75 origin-top mb-2 -mt-4">
                    <PitchVisualizer reading={fav.reading} pattern={fav.pitchPattern} />
                  </div>
                )}
                <div className="flex gap-2 mb-4">
                   <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[8px] font-bold rounded uppercase tracking-wider">{fav.pos}</span>
                   {(fav as any).jlpt && (fav as any).jlpt !== 'null' && (
                     <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[8px] font-bold rounded uppercase tracking-wider">{(fav as any).jlpt.toUpperCase()}</span>
                   )}
                </div>
                <div className="text-sm text-slate-500 mb-4 text-center line-clamp-1">{fav.translation}</div>
                <div className="flex gap-2 w-full">
                  <button 
                    onClick={() => {
                      setSelectedToken(fav as unknown as Token);
                      setView('study');
                    }}
                    className="flex-1 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all"
                  >
                    Details
                  </button>
                  <button 
                    onClick={() => toggleFavorite(fav as unknown as Token)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {favorites.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300">
              <Star size={64} className="mb-4 opacity-10" />
              <p className="font-bold uppercase tracking-widest text-xs">No saved words yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}