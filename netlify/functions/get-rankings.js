export const handler = async (event, context) => {
  const eventKey = event.queryStringParameters.event;
  const tbaKey = process.env.TBA_API_KEY;

  if (!eventKey) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing event parameter' }) };
  }

  if (!tbaKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing TBA API Key in environment' }) };
  }

  try {
    const res = await fetch(`https://www.thebluealliance.com/api/v3/event/${eventKey}/rankings`, {
      headers: {
        'X-TBA-Auth-Key': tbaKey,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`TBA returned ${res.status}`);
    }

    const data = await res.json();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.rankings || [])
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};