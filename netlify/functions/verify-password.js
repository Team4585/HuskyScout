exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    const { password } = JSON.parse(event.body);
    const correctPassword = process.env.PROCESS_MASTER_PASSWORD;
    
    if (password === correctPassword) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    } else {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Incorrect password' })
      };
    }
  } catch (error) {
    return { statusCode: 400, body: 'Invalid request' };
  }
};