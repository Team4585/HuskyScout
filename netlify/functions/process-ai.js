const fetch = require('node-fetch');

export const handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Missing request body' })
      };
    }

    const body = JSON.parse(event.body);
    const specs = body.specs;
    const strategy = body.strategy;
    const payload = body.payload;

    const apiKey = process.env.PROCESS_AI_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Server AI configuration is missing. Please redeploy.' })
      };
    }

    const prompt = `You are an elite FIRST Robotics Competition (FRC) scouting analyst and drive coach. Your task is to provide alliance selection picking suggestions for Team 4585 "Husky Robotics".
Our Robot Architecture: ${specs}
Selected Strategy Focus: ${strategy.toUpperCase()}
Here is the ranked picklist compiled from our scouting data:
${payload}

Provide a detailed strategic analysis and a recommended picklist order based on the specified focus.
You MUST return your response in valid JSON format with EXACTLY the following structure. Do not include any markdown formatting or prefix like \`\`\`json, just return raw JSON text:
{
  "report": "Detailed strategic analysis. Detail top 2 optimal first picks, second-pick support/defense bots, and potential trap teams based on notes and pit specs.",
  "recommended_order": ["TeamNumber1", "TeamNumber2", "TeamNumber3"]
}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'HTTP-Referer': 'https://huskyscout.com',
        'X-Title': 'HuskyScout'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const rawErr = await response.text();
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Upstream API error: ' + rawErr })
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    let jsonText = text.trim();
    if (jsonText.startsWith('```')) {
      const parts = jsonText.split('```');
      jsonText = parts[1];
      if (jsonText.startsWith('json')) {
        jsonText = jsonText.substring(4);
      }
    }
    jsonText = jsonText.trim();
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.substring(0, jsonText.length - 3).trim();
    }

    const parsed = JSON.parse(jsonText);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        report: parsed.report,
        recommended_order: parsed.recommended_order
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};