import type { Handler } from '@netlify/functions';

type CaptionTrack = {
  langCode: string;
  name: string;
  kind?: string;
  vssId?: string;
};

const preferredEnglishLangs = ['en', 'en-US', 'en-GB'];

function parseCaptionTracks(xml: string): CaptionTrack[] {
  const tracks: CaptionTrack[] = [];
  const trackRegex = /<track\s+([^>]+?)\/>/g;
  let match: RegExpExecArray | null;

  while ((match = trackRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
    const raw: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const key = attrMatch[1];
      const value = attrMatch[2];
      raw[key] = value;
    }

    const langCode = raw['lang_code'];
    if (!langCode) continue;

    tracks.push({
      langCode,
      name: raw['name'] || '',
      kind: raw['kind'],
      vssId: raw['vss_id'],
    });
  }

  return tracks;
}

function scoreTrack(track: CaptionTrack): number {
  const lang = track.langCode;
  const kind = track.kind || '';
  const isPreferred = preferredEnglishLangs.includes(lang);
  const isEnglishVariant = !isPreferred && lang.startsWith('en');

  let score = 0;

  if (isPreferred) {
    score += 200;
  } else if (isEnglishVariant) {
    score += 150;
  } else {
    score += 50;
  }

  if (!kind) {
    score += 20;
  } else if (kind === 'asr') {
    score += 10;
  }

  return score;
}

function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;

  const scored = tracks
    .map((track) => ({ track, score: scoreTrack(track) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.track ?? null;
}

async function fetchTrackTranscript(
  videoId: string,
  track: CaptionTrack
): Promise<string> {
  const params = new URLSearchParams({
    v: videoId,
    fmt: 'vtt',
    lang: track.langCode,
  });

  if (track.kind) {
    params.set('kind', track.kind);
  }

  if (track.name) {
    params.set('name', track.name);
  }

  const url = `https://www.youtube.com/api/timedtext?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    return '';
  }

  return res.text();
}

export const handler: Handler = async (event) => {
  const videoId = event.queryStringParameters?.videoId;

  if (!videoId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing videoId query parameter' }),
    };
  }

  try {
    let directTranscript = '';
    try {
      const directUrl = `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=vtt`;
      const directRes = await fetch(directUrl);
      if (directRes.ok) {
        directTranscript = (await directRes.text()).trim();
      }
    } catch {
      directTranscript = '';
    }

    if (directTranscript) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          transcript: directTranscript,
          lang: 'en',
          kind: 'direct',
        }),
      };
    }

    const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`;
    const listRes = await fetch(listUrl);

    if (!listRes.ok) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          transcript: '',
          reason: 'list_request_failed',
          status: listRes.status,
        }),
      };
    }

    const listXml = await listRes.text();
    const tracks = parseCaptionTracks(listXml);
    const bestTrack = pickBestTrack(tracks);

    if (!bestTrack) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          transcript: '',
          reason: 'no_captions_tracks',
        }),
      };
    }

    const trackTranscript = (await fetchTrackTranscript(
      videoId,
      bestTrack
    )).trim();

    if (!trackTranscript) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          transcript: '',
          reason: 'empty_captions',
          lang: bestTrack.langCode,
          kind: bestTrack.kind,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        transcript: trackTranscript,
        lang: bestTrack.langCode,
        kind: bestTrack.kind,
        trackName: bestTrack.name,
      }),
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
