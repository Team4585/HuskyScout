exports.handler = async (event, context) => {
  const tbaKey = process.env.PROCESS_TBA_AUTH_KEY;
  const teamKey = 'frc4585';
  
  try {
    const res = await fetch(`https://www.thebluealliance.com/api/v3/team/${teamKey}/events/simple`, {
      headers: { 'X-TBA-Auth-Key': tbaKey }
    });
    
    if (!res.ok) {
      return { statusCode: res.status, body: 'Error fetching TBA' };
    }
    
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
};