import type { Handler } from '@netlify/functions';

// Netlify Function: fetch YouTube transcript by videoId and return plain text
// We call YouTube's timedtext endpoint directly and stitch together caption segments.
export const handler: Handler = async (event) => {
  const videoId = event.queryStringParameters?.videoId;

  if (!videoId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing videoId query parameter' }),
    };
  }

  try {
    // Request WebVTT subtitles (plain text). Gemini can handle timestamped text directly.
    const url = `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=vtt`;
    const res = await fetch(url);

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({
          error: 'Failed to fetch captions from YouTube',
          status: res.status,
        }),
      };
    }

    const transcriptText = (await res.text()).trim();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ transcript: transcriptText }),
    };
  } catch (error: any) {
    console.error('Failed to fetch YouTube transcript', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch YouTube transcript',
        message: error?.message || 'Unknown error',
      }),
    };
  }
};
