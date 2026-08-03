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
    const password = body.password ? String(body.password).trim() : "";
    
    let correctPassword = process.env.PROCESS_MASTER_PASSWORD;
    
    if (!correctPassword) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Server password configuration is missing. Please redeploy.' })
      };
    }

    correctPassword = correctPassword.trim().replace(/^['"]|['"]$/g, '');

    if (!password) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Please enter a password' })
      };
    }

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
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Server error: ' + error.message })
    };
  }
};