import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

export const handler = async (event, context) => {
  if (!event.body) return;

  const body = JSON.parse(event.body);
  const { info, strategy, payload, rankings, jobId, fbConfig } = body;
  const apiKey = process.env.PROCESS_AI_KEY;

  if (!apiKey) {
    console.error("Missing PROCESS_AI_KEY in Netlify environment variables.");
    return;
  }

  const app = initializeApp(fbConfig);
  const db = getFirestore(app);
  const jobRef = doc(db, 'ai_jobs', jobId);

  try {
    // This is your exact detailed prompt
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

    // 2. Fetch from OpenRouter (Can safely take up to 15 minutes now!)
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
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error("Upstream API error: " + errText);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Safely extract the JSON block in case the AI wraps it in markdown (e.g., ```json)
    let jsonText = text.trim();
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonText);

    // 3. Save the successful result to Firebase so React can find it
    await setDoc(jobRef, {
      report: parsed.report || text,
      recommended_order: parsed.recommended_order || [],
      first_picks: parsed.first_picks || [],
      second_picks: parsed.second_picks || [],
      do_not_pick: parsed.do_not_pick || []
    });

  } catch (err) {
    console.error("AI Processing Error: ", err);
    // Save error to Firebase so the frontend stops spinning and shows the error to the user
    await setDoc(jobRef, { error: err.message || 'Failed to process AI request. Please try again.' });
  }
};