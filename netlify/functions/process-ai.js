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
    const info = body.info;
    const strategy = body.strategy;
    const payload = body.payload;
    const rankings = body.rankings;

    const apiKey = process.env.PROCESS_AI_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Server AI configuration is missing. Please redeploy.' })
      };
    }

    const prompt = `You are an elite FIRST Robotics Competition (FRC) scouting analyst and drive coach. Your task is to provide alliance selection picking suggestions for Team 4585 "Husky Robotics".

--- ALLIANCE STRATEGY FOCUS ---
Team 4585 Info: ${info}
Selected Strategy Focus: ${strategy.toUpperCase()}

--- OFFICIAL LIVE EVENT RANKINGS ---
${rankings || 'Rankings unavailable. Do not predict ranks, rely ONLY on the scouting data provided below.'}

--- INTERNAL SCOUTING DATA & HYBRID METRICS ---
Here is the ranked picklist compiled from our internal scouting data:
${payload}

--- INSTRUCTIONS ---
Provide a detailed strategic analysis and a recommended picklist order based on the specified focus.
If official rankings are provided above, use them to predict realistic picking scenarios:
- Who will likely be the top 8 captains?
- Based on 4585's rank, will they be a captain or a pick?
- Which top-tier bots will likely be unavailable for second picks?
Identify optimal first picks, optimal second-pick support/defense bots, and potential trap teams (teams that look good in official rankings but have poor scouting metrics or mechanical issues noted in pit specs).

You MUST return your response in a valid JSON object with EXACTLY the following structure:
{
  "report": "Detailed strategic analysis. Detail top 2 optimal first picks, 3 optimal second-pick support/defense bots, and potential trap teams.... Include teams that we should NOT pick",
  "recommended_order": ["TeamNumber1", "TeamNumber2", "TeamNumber3"],
  "first_picks": ["TeamNumber1", "TeamNumber2"],
  "second_picks": ["TeamNumber3", "TeamNumber4", "TeamNumber5"],
  "do_not_pick": ["TeamNumber6", "TeamNumber7"]
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
        model: 'google/gemini-2.0-flash-lite-preview-02-05:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2500, 
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
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("AI returned invalid JSON:", jsonText);
      return {
        statusCode: 200, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'The AI generated an incomplete response or ran out of tokens. Please try again.' 
        })
      };
    }

    const report = parsed.report || text;
    const recommended_order = Array.isArray(parsed.recommended_order) ? parsed.recommended_order : [];
    const first_picks = Array.isArray(parsed.first_picks) ? parsed.first_picks : [];
    const second_picks = Array.isArray(parsed.second_picks) ? parsed.second_picks : [];
    const do_not_pick = Array.isArray(parsed.do_not_pick) ? parsed.do_not_pick : [];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        report,
        recommended_order,
        first_picks,
        second_picks,
        do_not_pick
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