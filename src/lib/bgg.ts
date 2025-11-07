import axios from 'axios';
import { GameDto } from 'src/modules/game/game.dto';

const BGG_API_URL = 'https://boardgamegeek.com/xmlapi2/thing';
const BGG_API_TOKEN = process.env.BGG_API_TOKEN;

// Simple XML parser for BGG response
const parseXmlItem = (xmlString: string): any => {
  try {
    // Extract item id
    const idMatch = xmlString.match(/<item[^>]*id="(\d+)"/);
    const typeMatch = xmlString.match(/<item[^>]*type="([^"]+)"/);

    // Extract name (look for primary name first)
    let name = '';
    const primaryNameMatch = xmlString.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
    if (primaryNameMatch) {
      name = primaryNameMatch[1];
    } else {
      const nameMatch = xmlString.match(/<name[^>]*value="([^"]+)"/);
      if (nameMatch) name = nameMatch[1];
    }

    // Extract image and thumbnail
    const imageMatch = xmlString.match(/<image>([^<]+)<\/image>/);
    const thumbnailMatch = xmlString.match(/<thumbnail>([^<]+)<\/thumbnail>/);

    return {
      id: idMatch ? parseInt(idMatch[1]) : null,
      type: typeMatch ? typeMatch[1] : '',
      name,
      image: imageMatch ? imageMatch[1] : '',
      thumbnail: thumbnailMatch ? thumbnailMatch[1] : '',
    };
  } catch (err) {
    console.error('XML parsing error:', err);
    return null;
  }
};

export const getGameDetails = async (id: number): Promise<GameDto> => {
  try {
    console.log(`Fetching game details for BGG ID: ${id}`);

    const headers: any = {
      'User-Agent': 'Mozilla/5.0',
    };

    if (BGG_API_TOKEN) {
      headers['Authorization'] = `Bearer ${BGG_API_TOKEN}`;
      console.log('Using BGG API token');
    } else {
      console.warn('No BGG_API_TOKEN found in environment variables!');
    }

    const response = await axios.get(BGG_API_URL, {
      params: { id },
      headers,
      timeout: 30000,
    });

    console.log('BGG API Response status:', response.status);

    if (response.status !== 200) {
      console.warn(`Unexpected status: ${response.status}`);
      return;
    }

    const item = parseXmlItem(response.data);

    if (!item || !item.name) {
      console.warn(`Item not found or invalid for id: ${id}`);
      return;
    }

    return {
      _id: id,
      name: item.name,
      expansion: item.type === 'boardgameexpansion',
      image: item.image,
      thumbnail: item.thumbnail,
    };
  } catch (err) {
    console.error(`Error fetching game with id: ${id}`, err.message);
    return;
  }
};

export const getMultipleGameDetails = async (ids: number) => {
  try {
    const headers: any = {
      'User-Agent': 'Mozilla/5.0',
    };

    if (BGG_API_TOKEN) {
      headers['Authorization'] = `Bearer ${BGG_API_TOKEN}`;
    }

    const response = await axios.get(BGG_API_URL, {
      params: { id: ids },
      headers,
      timeout: 30000,
    });

    // Parse multiple items from XML
    const itemMatches = response.data.matchAll(/<item[^>]*>[\s\S]*?<\/item>/g);
    const items = [];

    for (const match of itemMatches) {
      const item = parseXmlItem(match[0]);
      if (item && item.name) {
        items.push({
          _id: item.id,
          name: item.name,
          expansion: item.type === 'boardgameexpansion',
          image: item.image,
          thumbnail: item.thumbnail,
        });
      }
    }

    return items;
  } catch (err) {
    console.error(`Error fetching games with ids: ${ids}`, err.message);
    return [];
  }
};
