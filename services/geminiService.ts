import { WeeklyPlan, WeeklyFocus } from "../types";

// --- Schemas for Tool Calling (in Chinese) ---
const weeklyPlanSchema = {
  type: "object",
  properties: {
    theme: {
      type: "string",
      description: "为本周计划起一个有吸引力的中文主题。",
    },
    philosophy: { type: "string", description: "与主题相关的简短中文宣传语。" },
    groceryList: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", description: "例如：'蔬菜', '肉类'" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                amount: { type: "string" },
              },
              required: ["name", "amount"],
            },
          },
        },
        required: ["category", "items"],
      },
    },
    menu: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "string", description: "例如：'周一'" },
          preparationTip: {
            type: "string",
            description: "当天的备餐中文小贴士。",
          },
          weekendPrepOperations: {
            type: "array",
            items: { type: "string" },
            description: "仅用于周六/周日。必须是详细的中文步骤。",
          },
          lunch: {
            type: "object",
            description: "一个包含详细中文信息的午餐食谱对象",
          },
          dinner: {
            type: "object",
            description: "一个包含详细中文信息的晚餐食谱对象",
          },
        },
        required: ["day", "preparationTip", "lunch", "dinner"],
      },
    },
  },
  required: ["theme", "philosophy", "groceryList", "menu"],
};

const todayRecommendationSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "推荐菜肴的中文名称。" },
    benefit: {
      type: "string",
      description: "主要的食养或中医健康益处的中文描述。",
    },
    reason: { type: "string", description: "今天为什么推荐这道菜的中文原因。" },
  },
  required: ["name", "benefit", "reason"],
};

// Helper to create a standardized fetch request to an OpenAI-compatible API
async function openaiFetch(
  endpoint: string,
  body: object,
  method: string = "POST",
) {
  const apiKey = localStorage.getItem("gemini_apiKey");
  const baseURL =
    localStorage.getItem("gemini_baseURL") || "https://api.openai.com/v1";

  if (!apiKey) {
    alert("API Key 未设置，请在设置页面中配置。");
    throw new Error("API Key not found in localStorage");
  }

  const fullURL = `${baseURL.replace(/\/$/, "")}${endpoint}`;

  const response = await fetch(fullURL, {
    method: method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    console.error("API Error:", errorBody);
    throw new Error(
      `API request failed: ${errorBody.error?.message || response.statusText}`,
    );
  }

  if (endpoint.includes("/speech")) {
    return response.arrayBuffer();
  }

  return response.json();
}

function extractFunctionCallArguments(apiResponse: any): any {
  console.log("Raw AI response (Tool Call):", apiResponse);
  const toolCalls = apiResponse.choices?.[0]?.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    throw new Error("Invalid API response: No tool calls found.");
  }

  const functionArguments = toolCalls[0].function.arguments;
  if (!functionArguments) {
    throw new Error(
      "Invalid API response: No function arguments found in tool call.",
    );
  }

  console.log("Arguments from tool call:", functionArguments);
  return JSON.parse(functionArguments);
}

export async function getAvailableModels(): Promise<string[]> {
  const apiKey = localStorage.getItem("gemini_apiKey");
  const baseURL =
    localStorage.getItem("gemini_baseURL") || "https://api.openai.com/v1";

  if (!apiKey) {
    throw new Error("API Key not set");
  }

  const response = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    console.error("Failed to fetch models:", await response.text());
    throw new Error("获取模型列表失败，请检查API Key和Base URL是否正确。");
  }

  const json = await response.json();
  return json.data
    .map((model: any) => model.id as string)
    .filter(
      (id: string) =>
        !id.includes("embed") &&
        !id.includes("tts") &&
        !id.includes("image") &&
        !id.includes("whisper") &&
        !id.includes("dall-e"),
    )
    .sort();
}

export async function generateWeeklyPlan(
  userPrompt: string,
  selectedFocus: WeeklyFocus[],
  locationContext: string,
  additionalPrefs: string = "",
): Promise<WeeklyPlan> {
  const model = localStorage.getItem("gemini_selectedModel") || "gpt-4-turbo";
  const focusMap: Record<string, string> = {
    tasty: "爆款风味",
    brain_power: "补脑续命",
    skin_beauty: "养颜滋阴",
    digestive: "健脾祛湿",
    stress_relief: "疏肝理气",
    weight_loss: "低卡掉秤",
    tcm_authentic: "正统食养",
    seasonal_health: "顺时依季",
  };
  const focusDescriptions = selectedFocus
    .map((f) => focusMap[f] || f)
    .join("、");
  const userMessage = `请为我生成一份为期7天的周度健康食谱。我的主要关注点是：${focusDescriptions}。额外偏好：${additionalPrefs || "无"}。请确保食谱步骤对新手友好且量化，并包含完整的购物清单。所有返回内容都必须是中文。`;

  try {
    const response = await openaiFetch("/chat/completions", {
      model: model,
      messages: [{ role: "user", content: userMessage }],
      tools: [
        {
          type: "function",
          function: {
            name: "display_weekly_plan",
            description: "根据用户偏好生成并展示一个完整的7日中文膳食计划。",
            parameters: weeklyPlanSchema,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "display_weekly_plan" },
      },
    });

    return extractFunctionCallArguments(response);
  } catch (error) {
    console.error("Generate Plan Error:", error);
    throw error;
  }
}

export async function getTodayRecommendation(
  selectedFocus: WeeklyFocus[],
): Promise<{ name: string; benefit: string; reason: string }> {
  const model = localStorage.getItem("gemini_selectedModel") || "gpt-3.5-turbo";
  const date = new Date();
  const month = date.getMonth() + 1;
  const season = [
    "冬季",
    "冬季",
    "春季",
    "春季",
    "春季",
    "夏季",
    "夏季",
    "夏季",
    "秋季",
    "秋季",
    "秋季",
    "冬季",
  ][date.getMonth()];
  const userMessage = `今天是 ${month}月${date.getDate()}日 (${season})。我的关注点是：${selectedFocus.join(", ")}。请给我一个今日特别推荐的菜肴，所有返回内容都必须是中文。`;

  try {
    const response = await openaiFetch("/chat/completions", {
      model: model,
      messages: [{ role: "user", content: userMessage }],
      tools: [
        {
          type: "function",
          function: {
            name: "display_today_recommendation",
            description: "为今天生成并展示一个单品的中文菜肴推荐。",
            parameters: todayRecommendationSchema,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "display_today_recommendation" },
      },
    });
    return extractFunctionCallArguments(response);
  } catch (error) {
    console.error("Get Recommendation Error:", error);
    return {
      name: "温水姜茶",
      benefit: "驱寒暖胃",
      reason: "系统忙碌中，建议先饮一杯温水保护肠胃。",
    };
  }
}

// Functions below do not require complex JSON structures, so they remain as they are.

export async function askChef(
  question: string,
  context: string,
): Promise<string> {
  const model = localStorage.getItem("gemini_selectedModel") || "gpt-3.5-turbo";
  const systemPrompt = `你是一位专业的中医药膳大厨。请根据用户提供的背景和问题，给出极其具体的厨艺或食养指导（150字内）。所有内容都必须是中文。`;
  const userMessage = `背景：${context}。\n提问：${question}。`;

  try {
    const response = await openaiFetch(
      "/chat/completions",
      {
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      },
      "POST",
    );

    const content = response.choices[0].message.content;
    console.log("Raw content from askChef:", content);
    return content || "大厨正在忙，请稍后再试。";
  } catch (error) {
    console.error("Ask Chef Error:", error);
    return "大厨忙晕了，请重试。";
  }
}

export async function speakChefText(text: string): Promise<ArrayBuffer> {
  try {
    const audioBuffer = await openaiFetch("/audio/speech", {
      model: "tts-1",
      input: `用温柔大厨语气读：${text}`,
      voice: "alloy",
    });
    return audioBuffer as ArrayBuffer;
  } catch (error) {
    console.error("Speech Generation Error:", error);
    throw new Error("Audio failed");
  }
}

export async function generateStepImage(
  recipeName: string,
  stepText: string,
): Promise<string> {
  const prompt = `Gourmet food prep, macro photography of "${recipeName}". A detailed, professional, ultra-high definition photo showing this specific step: "${stepText}". The lighting should be cinematic and soft, in a clean, modern kitchen setting.`;

  try {
    const response = await openaiFetch("/images/generations", {
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1792",
      response_format: "b64_json",
    });

    const b64_json = response.data[0].b64_json;
    if (!b64_json) {
      throw new Error("No image data returned from API.");
    }
    return `data:image/png;base64,${b64_json}`;
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw new Error("Image Failed");
  }
}
