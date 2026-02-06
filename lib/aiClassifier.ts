/**
 * AI Semantic Classification for ambiguous sports places
 * Uses LLM to understand what a place actually is based on text signals
 * Only runs for ambiguous cases to control cost and latency
 */

export type AIClassificationResult = {
  classification: "competitive_club" | "recreational" | "private" | "retail" | "unknown";
  confidence: number;
};

/**
 * Classify a place using AI semantic understanding
 * Only call this for ambiguous cases (score 40-70) or when OSM didn't confirm
 */
export async function classifyPlaceWithAI(input: {
  name: string;
  website?: string;
  reviews?: string[];
}): Promise<AIClassificationResult | null> {
  try {
    // Check if OpenAI API key is configured
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "your_openai_api_key_here") {
      console.debug("[AI Classifier] OpenAI API key not configured, skipping");
      return null;
    }

    // Build context from available information
    const contextParts: string[] = [];
    contextParts.push(`Name: ${input.name}`);
    
    if (input.website) {
      // For MVP, we'll use the website URL as context
      // In production, you might fetch and parse the website content
      contextParts.push(`Website: ${input.website}`);
    }
    
    if (input.reviews && input.reviews.length > 0) {
      const reviewText = input.reviews.slice(0, 3).join(" ");
      contextParts.push(`Reviews: ${reviewText.substring(0, 500)}`);
    }

    const context = contextParts.join("\n\n");

    // Deterministic prompt - no creativity
    const prompt = `You are classifying sports-related locations.

Determine whether this place is:
1) competitive_club - Competitive youth / travel sports club
2) recreational - Recreational facility (gym, rec center, park)
3) private - Private residence / unrelated
4) retail - Retail sporting goods store (Academy Sports, Dick's Sporting Goods, REI, Scheels, etc.)
5) unknown - Cannot determine

IMPORTANT: If the place is a retail sporting goods store (Academy, Dick's, REI, Scheels, Big 5, Sportsman's Warehouse, Bass Pro, Cabela's, Fleet Feet, Foot Locker, etc.),
classify it as "retail" with high confidence.

Use the name, website description, and reviews.

Return JSON ONLY:
{
  "classification": "competitive_club" | "recreational" | "private" | "retail" | "unknown",
  "confidence": 0.0-1.0
}

Place information:
${context}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Use cheaper model for classification
        messages: [
          {
            role: "system",
            content: "You are a classification assistant. Return only valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1, // Low temperature for deterministic results
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[AI Classifier] API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.warn("[AI Classifier] No content in response");
      return null;
    }

    // Parse JSON response
    try {
      const result = JSON.parse(content.trim());
      
      // Validate classification
      const validClassifications = ["competitive_club", "recreational", "private", "retail", "unknown"];
      if (!validClassifications.includes(result.classification)) {
        console.warn(`[AI Classifier] Invalid classification: ${result.classification}`);
        return null;
      }

      // Validate confidence
      const confidence = Math.max(0, Math.min(1, result.confidence || 0));

      return {
        classification: result.classification,
        confidence,
      };
    } catch (parseError) {
      console.warn("[AI Classifier] Failed to parse JSON response:", content);
      return null;
    }
  } catch (error) {
    // Silently fail - AI is optional signal
    console.debug(`[AI Classifier] Classification failed:`, error);
    return null;
  }
}
