
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, ShoppingCart, Info, Leaf, ChevronRight, Clock, CheckCircle2, 
  Loader2, Weight, MapPin, Package, ChefHat, Timer, Brain, Heart, Activity, 
  Coffee, Star, Camera, X, Check, Heart as HeartIcon,
  Zap, UtensilsCrossed, Trash2, Edit3, MessageCircle, RefreshCw,
  Sun, Thermometer, ListChecks, ArrowDownWideNarrow, Sparkles, Flame, 
  Copy, Share2, Soup, GlassWater, Moon, Eye, ShieldCheck, Send, Info as InfoIcon,
  PartyPopper, BookOpen, User, Sparkle, ListTodo, ClipboardCopy, Plus,
  AlertTriangle, ThumbsUp, ThumbsDown, Smile, Frown, Meh, Image as ImageIcon,
  ChefHatIcon, Utensils, Mic, MicOff, Volume2, Play, Scale
} from 'lucide-react';
import { WeeklyPlan, TabType, Recipe, WeeklyFocus } from './types';
import { generateWeeklyPlan, generateStepImage, getTodayRecommendation, askChef, speakChefText } from './services/geminiService';

interface StepUIState {
  imageUrl?: string;
  isGenerating?: boolean;
}

const TASTE_OPTIONS = ["更辣一些", "不要辣", "更甜一点", "低油盐", "浓郁重口", "清淡解腻"];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('planner');
  const [selectedFocus, setSelectedFocus] = useState<WeeklyFocus[]>(['tasty']);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [todayRec, setTodayRec] = useState<{ name: string; benefit: string; reason: string } | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [stepUIStates, setStepUIStates] = useState<Record<string, StepUIState>>({});
  const [prepUIStates, setPrepUIStates] = useState<Record<string, StepUIState>>({});
  const [locationStr, setLocationStr] = useState<string>("上海");
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Recipe[]>([]);
  const [boughtItems, setBoughtItems] = useState<Set<string>>(new Set());
  const [additionalPrefs, setAdditionalPrefs] = useState("");
  const [refineText, setRefineText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);

  // Question Box States
  const [questionText, setQuestionText] = useState("");
  const [chefAnswer, setChefAnswer] = useState<string | null>(null);
  const [isChefThinking, setIsChefThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const savedFavs = localStorage.getItem('chef_favs_v12');
    if (savedFavs) setFavorites(JSON.parse(savedFavs));
    const savedBought = localStorage.getItem('bought_items_v12');
    if (savedBought) setBoughtItems(new Set(JSON.parse(savedBought)));
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocationStr(`${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`),
        () => console.warn("Geolocation denied")
      );
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = 'zh-CN';
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuestionText(transcript);
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('chef_favs_v12', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('bought_items_v12', JSON.stringify(Array.from(boughtItems)));
  }, [boughtItems]);

  const sortedMenu = useMemo(() => {
    if (!plan) return [];
    // 强制周六周日排在最前面
    const order = ["周六", "周日", "周一", "周二", "周三", "周四", "周五"];
    return [...plan.menu].sort((a, b) => {
      const getIdx = (dayStr: string) => order.findIndex(o => dayStr.includes(o));
      return getIdx(a.day) - getIdx(b.day);
    });
  }, [plan]);

  const handleGeneratePlan = async (isRefining = false) => {
    if (selectedFocus.length === 0) {
      alert("请至少选择一个关注方向哦！");
      return;
    }
    setLoading(true);
    try {
      const finalPrefs = isRefining ? `${additionalPrefs}\n[口味微调]: ${refineText}` : additionalPrefs;
      
      const [planData, recData] = await Promise.all([
        generateWeeklyPlan("职场健康餐", selectedFocus, locationStr, finalPrefs),
        getTodayRecommendation(selectedFocus)
      ]);
      
      setPlan(planData);
      setTodayRec(recData);
      
      if (isRefining) {
        setAdditionalPrefs(finalPrefs);
        setRefineText("");
      } else {
        setBoughtItems(new Set());
      }
    } catch (error: any) {
      console.error("Failure:", error);
      alert("AI 主厨暂时无法调配方案，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleTasteRefine = (taste: string) => {
    setRefineText(taste);
    handleGeneratePlan(true);
  };

  const handleAskChef = async () => {
    if (!questionText.trim()) return;
    setIsChefThinking(true);
    setChefAnswer(null);
    try {
      const context = selectedRecipe 
        ? `正在查看食谱：${selectedRecipe.name}，步骤：${selectedRecipe.steps.join(' ')}` 
        : `当前饮食计划：${plan?.theme}`;
      const answer = await askChef(questionText, context);
      setChefAnswer(answer);
    } catch (e) {
      setChefAnswer("大厨忙晕了，请重试。");
    } finally {
      setIsChefThinking(false);
    }
  };

  const playChefAudio = async () => {
    if (!chefAnswer || isSpeaking) return;
    setIsSpeaking(true);
    try {
      const audioBuffer = await speakChefText(chefAnswer);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      const dataInt16 = new Int16Array(audioBuffer);
      const float32Data = new Float32Array(dataInt16.length);
      for (let i = 0; i < dataInt16.length; i++) {
        float32Data[i] = dataInt16[i] / 32768.0;
      }
      const buffer = ctx.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsSpeaking(false);
      source.start();
    } catch (e) {
      console.error("Audio playback error", e);
      setIsSpeaking(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setQuestionText("");
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const copyShoppingList = () => {
    if (!plan) return;
    const text = plan.groceryList.map(cat => 
      `【${cat.category}】\n${cat.items.map(i => `- ${i.name}: ${i.amount}`).join('\n')}`
    ).join('\n\n');
    navigator.clipboard.writeText(`岐黄食养高效清单：\n\n${text}`).then(() => alert("清单已复制！"));
  };

  const copyCategory = (categoryName: string, items: { name: string, amount: string }[]) => {
    const text = `【${categoryName}】\n${items.map(i => `- ${i.name}: ${i.amount}`).join('\n')}`;
    navigator.clipboard.writeText(text).then(() => alert(`${categoryName}清单已复制！`));
  };

  const toggleFocus = (f: WeeklyFocus) => {
    if (f === 'auto') {
      setSelectedFocus(['auto']);
      return;
    }
    const newFocus = selectedFocus.includes('auto') ? [] : [...selectedFocus];
    if (newFocus.includes(f)) {
      setSelectedFocus(newFocus.filter(item => item !== f));
    } else {
      setSelectedFocus([...newFocus, f]);
    }
  };

  const toggleFavorite = (recipe: Recipe) => {
    const isFav = favorites.some(f => f.name === recipe.name);
    if (isFav) setFavorites(favorites.filter(f => f.name !== recipe.name));
    else setFavorites([recipe, ...favorites]);
  };

  const toggleBought = (catIdx: number, itemIdx: number) => {
    const id = `${catIdx}-${itemIdx}`;
    const newBought = new Set(boughtItems);
    if (newBought.has(id)) newBought.delete(id);
    else newBought.add(id);
    setBoughtItems(newBought);
  };

  const handleImageAction = async (ownerName: string, text: string, type: 'step' | 'prep') => {
    const key = `${ownerName}-${text}`;
    const setter = type === 'prep' ? setPrepUIStates : setStepUIStates;
    setter(prev => ({ ...prev, [key]: { ...prev[key], isGenerating: true } }));
    try {
      const url = await generateStepImage(ownerName, text);
      setter(prev => ({ ...prev, [key]: { imageUrl: url, isGenerating: false } }));
    } catch (e) {
      console.error(e);
      setter(prev => ({ ...prev, [key]: { isGenerating: false } }));
    }
  };

  const sendFeedback = (type: string) => {
    setFeedbackSent(type);
    setTimeout(() => setFeedbackSent(null), 3000);
  };

  const recipeIsCompleted = useMemo(() => {
    if (!selectedRecipe) return false;
    return selectedRecipe.steps.every((_, idx) => completedSteps.has(`${selectedRecipe.name}-${idx}`));
  }, [selectedRecipe, completedSteps]);

  return (
    <div className="min-h-screen pb-32 bg-[#F8FAF8] text-stone-900">
      <header className="bg-white/95 backdrop-blur-xl border-b border-stone-100 sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-stone-900 p-2 rounded-xl shadow-lg">
            <UtensilsCrossed className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-black serif-font text-stone-800 tracking-tight">岐黄小厨</h1>
        </div>
        <div className="flex items-center gap-2">
           <MapPin className="w-3.5 h-3.5 text-stone-300" />
           <span className="text-[10px] font-bold text-stone-400">{locationStr === "上海" ? "上海" : "智能定位"}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-8">
        {!plan && !loading && activeTab !== 'favorites' && activeTab !== 'about' ? (
          <div className="pt-6 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-3 px-4">
               <h2 className="text-4xl font-black text-stone-800 serif-font tracking-tight">制定本周计划</h2>
               <p className="text-stone-400 text-sm font-semibold">极致高效的备菜逻辑 · 中医调理智慧</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FocusCard active={selectedFocus.includes('tasty')} onClick={() => toggleFocus('tasty')} icon={<Sparkles />} label="爆款风味" desc="复刻外卖餐厅" color="rose" />
              <FocusCard active={selectedFocus.includes('tcm_authentic')} onClick={() => toggleFocus('tcm_authentic')} icon={<Leaf />} label="正统食养" desc="深度药食同源" color="emerald" />
              <FocusCard active={selectedFocus.includes('weight_loss')} onClick={() => toggleFocus('weight_loss')} icon={<Flame />} label="低卡掉秤" desc="热量管理专家" color="rose" />
              <FocusCard active={selectedFocus.includes('skin_beauty')} onClick={() => toggleFocus('skin_beauty')} icon={<HeartIcon />} label="养颜滋阴" desc="元气女神必备" color="pink" />
              <FocusCard active={selectedFocus.includes('brain_power')} onClick={() => toggleFocus('brain_power')} icon={<Brain />} label="效率续命" desc="补脑抗疲劳" color="blue" />
              <FocusCard active={selectedFocus.includes('digestive')} onClick={() => toggleFocus('digestive')} icon={<Activity />} label="健脾祛湿" desc="解腻去油去湿" color="emerald" />
              <FocusCard active={selectedFocus.includes('stress_relief')} onClick={() => toggleFocus('stress_relief')} icon={<Sun />} label="疏肝理气" desc="疏解工作压力" color="amber" />
              <FocusCard active={selectedFocus.includes('seasonal_health')} onClick={() => toggleFocus('seasonal_health')} icon={<Thermometer />} label="顺时而养" desc="时令节气调理" color="indigo" />
            </div>

            <div className="bg-white p-6 rounded-[2.5rem] border border-stone-100 shadow-sm space-y-4">
               <div className="flex items-center gap-2 text-[11px] font-black text-stone-300 uppercase tracking-widest px-1">
                  <MessageCircle className="w-4 h-4" /> 补充个人偏好
               </div>
               <textarea 
                value={additionalPrefs}
                onChange={(e) => setAdditionalPrefs(e.target.value)}
                placeholder="例如：我不吃姜 / 只要极简菜 / 某天需要补气..."
                className="w-full bg-stone-50 border border-transparent rounded-2xl p-4 text-sm focus:ring-2 focus:ring-rose-500 outline-none min-h-[80px]"
               />
               <button onClick={() => handleGeneratePlan()} className="w-full bg-stone-900 text-white py-6 rounded-[2rem] font-black text-lg shadow-2xl hover:bg-rose-500 active:scale-95 transition-all flex items-center justify-center gap-2">
                 开始智能排餐 <Zap className="w-5 h-5" />
               </button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-48 text-center space-y-6 animate-pulse">
             <div className="w-24 h-24 relative">
                <Loader2 className="w-full h-full animate-spin text-rose-500" />
                <ChefHat className="absolute inset-0 m-auto w-10 h-10 text-rose-500" />
             </div>
             <p className="font-black text-xl text-stone-800">正在调配方案...</p>
          </div>
        ) : activeTab === 'planner' && plan ? (
          <div className="space-y-6 animate-in fade-in duration-500">
             <div className="bg-stone-900 text-white rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
                <div className="flex items-center gap-2 mb-3 relative z-10">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">岐黄智控 · 高效周历</span>
                </div>
                <h2 className="text-3xl font-black mb-4 serif-font tracking-tight relative z-10">{plan.theme}</h2>
                <p className="text-sm text-stone-400 font-medium leading-relaxed italic relative z-10">“{plan.philosophy}”</p>
              </div>

              {/* 口味微调栏 */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                 {TASTE_OPTIONS.map(taste => (
                    <button 
                      key={taste} 
                      onClick={() => handleTasteRefine(taste)}
                      className="shrink-0 px-4 py-2 bg-white border border-stone-100 rounded-full text-[11px] font-black text-stone-600 hover:border-rose-400 hover:text-rose-500 transition-all shadow-sm"
                    >
                      {taste}
                    </button>
                 ))}
              </div>

              {/* 今日推荐 */}
              {todayRec && (
                <div className="bg-amber-50 border border-amber-200 rounded-[2.5rem] p-8 shadow-sm flex flex-col sm:flex-row items-center gap-6 animate-in zoom-in-95">
                   <div className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center shrink-0 shadow-lg">
                      <Soup className="text-white w-8 h-8" />
                   </div>
                   <div className="flex-1 text-center sm:text-left">
                      <span className="text-[9px] font-black text-amber-600 bg-white border border-amber-100 px-2 py-0.5 rounded-full uppercase tracking-widest mb-2 inline-block">今日特别推荐</span>
                      <h3 className="text-2xl font-black text-stone-800 serif-font mb-1">{todayRec.name}</h3>
                      <div className="text-xs font-bold text-amber-700 mb-2 flex items-center justify-center sm:justify-start gap-1">
                         <Sparkle className="w-3.5 h-3.5" /> {todayRec.benefit}
                      </div>
                      <p className="text-[11px] text-stone-500 font-medium leading-relaxed italic">{todayRec.reason}</p>
                   </div>
                </div>
              )}

              <div className="space-y-4">
                {sortedMenu.map((day, dIdx) => (
                    <div key={dIdx} className="bg-white rounded-[2rem] overflow-hidden shadow-sm border border-stone-100 transition-all">
                      <div className={`px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b border-stone-50 ${day.day.includes('周六') || day.day.includes('周日') ? 'bg-amber-50/40' : 'bg-stone-50/30'}`}>
                          <div className="flex items-center gap-2 shrink-0">
                            <h3 className="font-black text-stone-800 text-sm tracking-tight">{day.day}</h3>
                            {(day.day.includes('周六') || day.day.includes('周日')) && <span className="text-[9px] font-black bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full uppercase">备菜核心</span>}
                          </div>
                          <div className="text-[10px] font-bold text-stone-500 bg-white px-3 py-1.5 rounded-full border border-stone-100 shadow-sm whitespace-normal leading-relaxed">
                            💡 {day.preparationTip}
                          </div>
                      </div>

                      {/* 备菜具体量与步骤 */}
                      {(day.day.includes('周六') || day.day.includes('周日')) && day.weekendPrepOperations && (
                        <div className="px-6 py-6 bg-amber-50/20 border-b border-stone-50 space-y-4">
                           <div className="flex items-center gap-2">
                              <ListTodo className="w-4 h-4 text-amber-500" />
                              <span className="text-[11px] font-black text-amber-600 uppercase tracking-widest">全周食材预处理 (Master Prep)</span>
                           </div>
                           <div className="space-y-3">
                              {day.weekendPrepOperations.map((op, idx) => {
                                const prepKey = `${day.day}-${op}`;
                                const prepUI = prepUIStates[prepKey] || {};
                                return (
                                  <div key={idx} className="space-y-3">
                                    <div className="flex gap-4 bg-white p-4 rounded-2xl border border-amber-100 shadow-sm group">
                                      <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                          <span className="text-[10px] font-black text-amber-600">{idx + 1}</span>
                                      </div>
                                      <div className="flex-1 flex justify-between items-start gap-2">
                                        <p className="text-[13px] font-bold text-stone-700 leading-relaxed">{op}</p>
                                        <button 
                                          onClick={() => handleImageAction(day.day, op, 'prep')} 
                                          disabled={prepUI.isGenerating}
                                          className="shrink-0 p-1.5 bg-amber-50 text-amber-500 rounded-lg hover:bg-amber-500 hover:text-white transition-all disabled:opacity-50"
                                        >
                                          {prepUI.isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                                        </button>
                                      </div>
                                    </div>
                                    {prepUI.imageUrl && (
                                      <div className="ml-10 rounded-2xl overflow-hidden border-2 border-white shadow-md max-w-[240px] animate-in zoom-in">
                                         <img src={prepUI.imageUrl} className="w-full aspect-[3/4] object-cover" alt="prep" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                           </div>
                        </div>
                      )}

                      <div className="divide-y divide-stone-50">
                          <MealRow recipe={day.lunch} type="午餐" onClick={() => setSelectedRecipe(day.lunch)} />
                          <MealRow recipe={day.dinner} type="晚餐" onClick={() => setSelectedRecipe(day.dinner)} />
                      </div>
                    </div>
                ))}
              </div>
          </div>
        ) : activeTab === 'shopping' && plan ? (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
             <div className="bg-stone-900 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden text-center">
                <h3 className="text-2xl font-black serif-font mb-4">全周精准清单</h3>
                <button onClick={copyShoppingList} className="bg-white/10 px-6 py-3 rounded-xl hover:bg-white/20 transition-all inline-flex items-center gap-2 mx-auto">
                    <Copy className="w-5 h-5" /><span className="text-xs font-black uppercase">复制清单</span>
                </button>
             </div>
             {plan.groceryList.map((cat, cIdx) => (
                <div key={cIdx} className="bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100">
                   <div className="flex items-center justify-between mb-5">
                      <h4 className="text-[11px] font-black text-stone-300 uppercase tracking-widest">{cat.category}</h4>
                      <button onClick={() => copyCategory(cat.category, cat.items)} className="text-[10px] font-black text-rose-500 bg-rose-50 px-3 py-1 rounded-full">复制分类</button>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {cat.items.map((item, iIdx) => {
                         const isChecked = boughtItems.has(`${cIdx}-${iIdx}`);
                         return (
                           <button key={iIdx} onClick={() => toggleBought(cIdx, iIdx)} className={`flex justify-between items-center p-4 rounded-2xl text-[13px] border transition-all ${isChecked ? 'bg-stone-50 border-stone-100 text-stone-300' : 'bg-white border-stone-100 hover:border-rose-200'}`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-stone-200'}`}>
                                  {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                                </div>
                                <span className={isChecked ? 'line-through' : 'font-bold'}>{item.name}</span>
                              </div>
                              <span className="font-black text-rose-500">{item.amount}</span>
                           </button>
                         );
                      })}
                   </div>
                </div>
             ))}
          </div>
        ) : activeTab === 'favorites' ? (
          <div className="space-y-6 pt-6 animate-in fade-in">
             <h2 className="text-3xl font-black text-stone-800 px-4 serif-font">心水食谱</h2>
             {favorites.length === 0 ? (
               <div className="bg-white rounded-[2rem] p-20 text-center border-2 border-dashed border-stone-100">
                 <Star className="w-12 h-12 text-stone-100 mx-auto mb-4" /><p className="text-stone-300 font-bold">暂无收藏</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 gap-4">
                 {favorites.map((fav, i) => (
                   <div key={i} className="bg-white p-6 rounded-[2rem] border border-stone-100 flex items-center justify-between group cursor-pointer" onClick={() => setSelectedRecipe(fav)}>
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 rounded-2xl bg-stone-900 text-white flex items-center justify-center font-black">{fav.name[0]}</div>
                       <div><h4 className="font-bold text-stone-800">{fav.name}</h4><p className="text-[10px] text-stone-300 uppercase font-black">{fav.calories}</p></div>
                     </div>
                     <ChevronRight className="w-5 h-5 text-stone-200" />
                   </div>
                 ))}
               </div>
             )}
          </div>
        ) : activeTab === 'about' ? (
           <div className="pt-6 space-y-10 animate-in fade-in duration-500 text-center">
              <div className="w-16 h-16 bg-stone-900 rounded-3xl flex items-center justify-center mx-auto shadow-2xl rotate-3 mb-4">
                 <UtensilsCrossed className="text-white w-8 h-8" />
              </div>
              <h2 className="text-3xl font-black text-stone-800 serif-font">关于岐黄小厨</h2>
              <p className="text-stone-400 text-sm font-semibold max-w-sm mx-auto leading-relaxed">中医智慧赋能高效职场，为您量身定制的“极速食养”专家。</p>
           </div>
        ) : null}
      </main>

      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-stone-950/95 backdrop-blur-2xl text-white px-6 py-4 rounded-[2.5rem] flex items-center gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.4)] z-50 border border-white/5">
        <NavIcon active={activeTab === 'planner'} onClick={() => setActiveTab('planner')} icon={<Calendar />} label="计划" />
        <NavIcon active={activeTab === 'shopping'} onClick={() => setActiveTab('shopping')} icon={<ListChecks />} label="清单" />
        <NavIcon active={activeTab === 'favorites'} onClick={() => setActiveTab('favorites')} icon={<Star />} label="收藏" />
        <NavIcon active={activeTab === 'about'} onClick={() => setActiveTab('about')} icon={<Info />} label="关于" />
      </nav>

      {selectedRecipe && (
        <div className="fixed inset-0 bg-stone-950/40 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
           <div className="bg-[#FEFDFC] w-full max-w-xl sm:rounded-[3rem] h-[96vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-full border-t border-stone-100">
              <div className="p-8 border-b border-stone-50 flex justify-between items-start shrink-0">
                 <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                       <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-2.5 py-1 rounded-full">{selectedRecipe.calories}</span>
                    </div>
                    <h3 className="text-3xl font-black text-stone-800 serif-font tracking-tight">{selectedRecipe.name}</h3>
                    <div className="flex items-center gap-2 mt-3 text-[11px] font-bold text-stone-400">
                       <Leaf className="w-3.5 h-3.5 text-emerald-500" /><span>{selectedRecipe.tcmBenefit}</span>
                    </div>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={() => toggleFavorite(selectedRecipe)} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md ${favorites.some(f => f.name === selectedRecipe.name) ? 'bg-rose-500 text-white' : 'bg-stone-50 text-stone-300'}`}>
                       <HeartIcon className={`w-6 h-6 ${favorites.some(f => f.name === selectedRecipe.name) ? 'fill-current' : ''}`} />
                    </button>
                    <button onClick={() => setSelectedRecipe(null)} className="w-12 h-12 rounded-2xl bg-stone-50 text-stone-300 flex items-center justify-center"><X className="w-6 h-6" /></button>
                 </div>
              </div>

              <div className="flex-grow overflow-y-auto p-8 space-y-10 pb-40">
                 {/* 避坑指南模块 */}
                 <div className="bg-rose-50 p-6 rounded-[2rem] border border-rose-100 space-y-2">
                    <div className="flex items-center gap-2">
                       <AlertTriangle className="w-5 h-5 text-rose-500" />
                       <span className="text-[11px] font-black text-rose-400 uppercase tracking-widest">药食避坑指南</span>
                    </div>
                    <p className="text-[13px] font-bold text-stone-700 leading-relaxed">{selectedRecipe.tcmTaboos}</p>
                 </div>

                 {/* 食材明细与用量板块 (New) */}
                 <section className="space-y-6">
                    <div className="flex items-center justify-between">
                       <h4 className="text-[11px] font-black flex items-center gap-2 uppercase tracking-widest text-stone-300">
                          <Scale className="w-4 h-4 text-rose-500" /> 食材清单与用量
                       </h4>
                       <span className="text-[9px] font-black text-stone-400 border border-stone-100 px-2 py-0.5 rounded-full uppercase">精准配比</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       {selectedRecipe.ingredients.map((ing, idx) => (
                          <div key={idx} className="bg-stone-50/50 border border-stone-100 p-4 rounded-2xl flex flex-col gap-1 hover:border-emerald-200 transition-colors">
                             <span className="text-[13px] font-bold text-stone-800">{ing.name}</span>
                             <span className="text-[11px] font-black text-emerald-600 uppercase tracking-tight">{ing.amount}</span>
                          </div>
                       ))}
                    </div>
                 </section>

                 <section className="space-y-8">
                    <h4 className="text-[11px] font-black mb-5 flex items-center gap-2 uppercase tracking-widest text-stone-300">
                       <ChefHat className="w-4 h-4 text-rose-500" /> 保姆级实操步骤
                    </h4>
                    {selectedRecipe.steps.map((step, idx) => {
                       const stepKey = `${selectedRecipe.name}-${step}`;
                       const uiState = stepUIStates[stepKey] || {};
                       const isDone = completedSteps.has(stepKey);
                       return (
                         <div key={idx} className="space-y-5">
                            <div className="flex gap-5 group cursor-pointer" onClick={() => {
                               const newDone = new Set(completedSteps);
                               if (newDone.has(stepKey)) newDone.delete(stepKey); else newDone.add(stepKey);
                               setCompletedSteps(newDone);
                            }}>
                               <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-[11px] font-black shrink-0 shadow-md ${isDone ? 'bg-emerald-500 text-white' : 'bg-stone-900 text-white'}`}>{isDone ? <Check className="w-5 h-5" /> : idx + 1}</div>
                               <div className="flex-1 pt-1.5 flex justify-between items-start">
                                 <p className={`text-[15px] leading-relaxed ${isDone ? 'text-stone-300 line-through' : 'text-stone-800 font-bold'}`}>{step}</p>
                                 <button 
                                    onClick={(e) => { e.stopPropagation(); handleImageAction(selectedRecipe.name, step, 'step'); }} 
                                    disabled={uiState.isGenerating}
                                    className="shrink-0 p-2 bg-stone-50 text-stone-400 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-all ml-4"
                                  >
                                    {uiState.isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                                  </button>
                               </div>
                            </div>
                            <div className="ml-14">
                               {uiState.imageUrl && (
                                 <div className="rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-white aspect-[3/4] max-w-[280px] animate-in zoom-in">
                                    <img src={uiState.imageUrl} className="w-full h-full object-cover" alt="step" />
                                 </div>
                               )}
                            </div>
                         </div>
                       );
                    })}
                 </section>

                 {/* 评价反馈系统 */}
                 <div className="bg-stone-50 p-8 rounded-[2.5rem] space-y-5">
                    <div className="text-center">
                       <h5 className="font-black text-stone-800 text-sm mb-1 tracking-tight">味道合心意吗？</h5>
                       <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">您的反馈将优化大厨的后续推荐</p>
                    </div>
                    <div className="flex justify-center gap-6">
                       <FeedbackBtn active={feedbackSent === 'happy'} onClick={() => sendFeedback('happy')} icon={<Smile className="w-7 h-7" />} label="完美" color="rose" />
                       <FeedbackBtn active={feedbackSent === 'ok'} onClick={() => sendFeedback('ok')} icon={<Meh className="w-7 h-7" />} label="还行" color="stone" />
                       <FeedbackBtn active={feedbackSent === 'sad'} onClick={() => sendFeedback('sad')} icon={<Frown className="w-7 h-7" />} label="不合胃口" color="amber" />
                    </div>
                    {feedbackSent && (
                       <div className="text-center animate-in fade-in zoom-in">
                          <span className="bg-emerald-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase">反馈已收到！</span>
                       </div>
                    )}
                 </div>
              </div>

              <div className="p-8 border-t border-stone-50 bg-white/90 backdrop-blur-xl absolute bottom-0 left-0 right-0 z-10 flex gap-3">
                 <button onClick={() => setSelectedRecipe(null)} className="flex-1 bg-stone-900 text-white py-5 rounded-[2rem] font-black hover:bg-rose-500 transition-all">返回列表</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const FeedbackBtn: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string, color: string }> = ({ active, onClick, icon, label, color }) => {
   const colors: any = { rose: "text-rose-500 bg-rose-50 border-rose-100", stone: "text-stone-500 bg-white border-stone-100", amber: "text-amber-600 bg-amber-50 border-amber-100" };
   return (
      <button onClick={onClick} className={`flex flex-col items-center gap-2 p-4 rounded-3xl border-2 transition-all ${active ? colors[color] + " scale-110 shadow-lg" : "border-stone-100 bg-white text-stone-300 opacity-60 hover:opacity-100"}`}>
         {icon}
         <span className="text-[10px] font-black uppercase">{label}</span>
      </button>
   );
};

const FocusCard: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string, desc: string, color: string }> = ({ active, onClick, icon, label, desc, color }) => {
  const colors: any = { rose: "bg-rose-500 text-white", blue: "bg-blue-600 text-white", pink: "bg-pink-500 text-white", emerald: "bg-emerald-600 text-white", amber: "bg-amber-500 text-white", indigo: "bg-indigo-600 text-white" };
  return (
    <button onClick={onClick} className={`p-4 rounded-[2rem] text-left transition-all border-2 ${active ? `${colors[color]} border-transparent shadow-xl scale-[1.02]` : "bg-white border-stone-100 text-stone-800 hover:bg-rose-50/5"}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${active ? "bg-white/20" : "bg-stone-50 text-stone-400"}`}>{icon}</div>
      <div className="font-black text-[12px] mb-1 leading-tight">{label}</div>
      <div className="text-[9px] font-bold opacity-70 leading-tight">{desc}</div>
    </button>
  );
};

const MealRow: React.FC<{ recipe: Recipe, type: string, onClick: () => void }> = ({ recipe, type, onClick }) => (
  <button onClick={onClick} className="w-full px-6 py-6 text-left hover:bg-rose-50/5 transition-all flex items-center justify-between group">
    <div className="flex items-center gap-5">
      <div className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center font-black text-xs ${type === '午餐' ? 'bg-rose-500 text-white' : 'bg-stone-800 text-white'}`}>{type[0]}</div>
      <div>
        <div className="flex items-center gap-2 mb-1">
           <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">{recipe.efficiencyTag}</span>
        </div>
        <h4 className="font-bold text-stone-800 group-hover:text-rose-600 transition-colors text-[15px] tracking-tight">{recipe.name}</h4>
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-stone-300 font-black uppercase tracking-widest"><Clock className="w-3 h-3" /> {recipe.cookTime}</div>
      </div>
    </div>
    <ChevronRight className="w-5 h-5 text-stone-200" />
  </button>
);

const NavIcon: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition-all ${active ? 'bg-white text-stone-950 shadow-xl' : 'text-stone-500 hover:text-white hover:bg-white/10'}`}>
    {icon}<span className={`text-xs font-black ${active ? "block" : "hidden sm:block"}`}>{label}</span>
  </button>
);

export default App;
