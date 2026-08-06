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
You MUST return your response in a valid JSON object with EXACTLY the following structure:
{
  "report": "Detailed strategic analysis. Detail top 2 optimal first picks, second-pick support/defense bots, and potential trap teams based on notes and pit specs.",
  "recommended_order": ["TeamNumber1", "TeamNumber2", "TeamNumber3"]
}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'HTTP-Referer': 'https://huskyscout.netlify.app',
        'X-Title': 'HuskyScout'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        response_format: { type: 'json_object' }
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
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonText);
    const report = parsed.report || text;
    const recommended_order = Array.isArray(parsed.recommended_order) ? parsed.recommended_order : [];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        report,
        recommended_order
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