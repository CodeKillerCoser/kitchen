
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { WeeklyPlan, WeeklyFocus } from "../types";

// 辅助函数：清洗 AI 返回的字符串，确保只有纯 JSON 内容
function cleanJsonString(text: string): string {
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

const RECIPE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    tcmBenefit: { type: Type.STRING },
    tcmDrink: { type: Type.STRING },
    tcmTaboos: { type: Type.STRING, description: "中医禁忌，如：感冒发热期间不宜食用" },
    calories: { type: Type.STRING },
    nutritionSummary: { type: Type.STRING },
    prepTime: { type: Type.STRING },
    cookTime: { type: Type.STRING },
    difficulty: { type: Type.STRING },
    efficiencyTag: { type: Type.STRING },
    cuisineStyle: { type: Type.STRING },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { 
          name: { type: Type.STRING }, 
          amount: { type: Type.STRING } 
        },
        required: ['name', 'amount']
      }
    },
    steps: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: "极其详细的步骤，包含火候控制（如：中大火）、切割规格（如：2mm薄片）、状态判断标准（如：直到色泽金黄）" }
    }
  },
  required: [
    'name', 'tcmBenefit', 'tcmDrink', 'tcmTaboos', 'calories', 'nutritionSummary', 
    'prepTime', 'cookTime', 'difficulty', 'efficiencyTag', 
    'cuisineStyle', 'ingredients', 'steps'
  ]
};

const WEEKLY_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    theme: { type: Type.STRING },
    philosophy: { type: Type.STRING },
    groceryList: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { name: { type: Type.STRING }, amount: { type: Type.STRING } },
              required: ['name', 'amount']
            }
          }
        },
        required: ['category', 'items']
      }
    },
    menu: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.STRING, description: "周六至周五共七天" },
          preparationTip: { type: Type.STRING },
          weekendPrepOperations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "详细的批量备菜步骤，必须包含精准量化（如：将500g猪肉切成3cm方块）和分装预处理指导"
          },
          lunch: RECIPE_SCHEMA,
          dinner: RECIPE_SCHEMA
        },
        required: ['day', 'lunch', 'dinner', 'preparationTip']
      }
    }
  },
  required: ['theme', 'philosophy', 'groceryList', 'menu']
};

export async function generateWeeklyPlan(userPrompt: string, selectedFocus: WeeklyFocus[], locationContext: string, additionalPrefs: string = ""): Promise<WeeklyPlan> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const focusMap: Record<string, string> = {
    tasty: "爆款风味", brain_power: "补脑续命", skin_beauty: "养颜滋阴",
    digestive: "健脾祛湿", stress_relief: "疏肝理气", post_workout: "高蛋白恢复",
    weight_loss: "低卡掉秤", late_night: "熬夜修复", tcm_authentic: "正统食养",
    seasonal_health: "顺时依季", energy_boost: "大补元气", family_friendly: "全家共享",
    gut_health: "润肠通便", sleep_well: "宁心安神", eye_care: "明目护眼",
    auto: "智能自动"
  };

  const focusDescriptions = selectedFocus.map(f => focusMap[f] || f).join('、');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `你是一位顶级中医药食同源主厨，专为追求效率的职场人规划一周健康膳食。
      
      【核心质量指令】：
      1. **新手友好型步骤**：在生成 steps 时，不要使用“适量”、“少许”等模糊词（除非是调料）。必须描述火候、切割规格和感官判断。
      2. **精准备菜量化**：weekendPrepOperations 必须包含具体的克数或数量指导。
      3. **高效复用逻辑**：工作日餐食应说明如何复用周末处理好的半成品。
      4. **无食材限制**：不受食材数量限制，追求正统疗效。
      
      用户方向：${focusDescriptions}。
      偏好：${additionalPrefs || '无'}。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: WEEKLY_PLAN_SCHEMA as any,
      },
    });

    if (!response.text) throw new Error("AI 返回内容为空");
    return JSON.parse(cleanJsonString(response.text));
  } catch (error) {
    console.error("Generate Plan Error:", error);
    throw error;
  }
}

export async function getTodayRecommendation(selectedFocus: WeeklyFocus[]): Promise<{ name: string; benefit: string; reason: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const date = new Date();
  const month = date.getMonth() + 1;
  const seasons = ["冬季", "冬季", "春季", "春季", "春季", "夏季", "夏季", "夏季", "秋季", "秋季", "秋季", "冬季"];
  const season = seasons[date.getMonth()];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `今天是 ${month}月${date.getDate()}日 (${season})。用户关注：${selectedFocus.join(', ')}。请推荐一道特别适合今日食用的药膳 JSON。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            benefit: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ["name", "benefit", "reason"]
        }
      }
    });
    return JSON.parse(cleanJsonString(response.text));
  } catch (error) {
    return { name: "温水姜茶", benefit: "驱寒暖胃", reason: "系统忙碌中，建议先饮一杯温水保护肠胃。" };
  }
}

export async function askChef(question: string, context: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `你是一位专业的中医药膳大厨。背景：${context}。提问：${question}。请给出极其具体的厨艺或食养指导（150字内）。`,
  });
  return response.text || "大厨正在忙，请稍后再试。";
}

export async function speakChefText(text: string): Promise<ArrayBuffer> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `用温柔大厨语气读：${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Audio failed");
  
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateStepImage(recipeName: string, stepText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Gourmet food prep, macro photography: "${recipeName}". Close-up visual of: ${stepText}. Cinematic soft lighting, professional chef kitchen background, ultra-high definition.`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "3:4" } }
  });
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
  }
  throw new Error("Image Failed");
}
