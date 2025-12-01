import type { Handler } from '@netlify/functions';
import { YoutubeTranscript } from 'youtube-transcript';

// Netlify Function: fetch YouTube transcript by videoId and return plain text
export const handler: Handler = async (event) => {
  const videoId = event.queryStringParameters?.videoId;

  if (!videoId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing videoId query parameter' }),
    };
  }

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId as string, {
      lang: 'en',
    });

    const transcriptText = items
      .map((item) => item.text)
      .join(' ');

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
