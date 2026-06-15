const { getNvidiaClient } = require('./nvidiaAiService');

/**
 * Service to extract ticket fields from email content using AI.
 */
class AiExtractionService {
  /**
   * Extracts fields from email content with smart cleaning and dynamic product/module lists.
   * @param {string} subject 
   * @param {string} body 
   * @param {string[]} allowedProducts List of products the sender's organization is registered for.
   * @param {Object} allowedModulesMap Map of product names to their active module names.
   */
  async extractTicketFields(subject, body, allowedProducts = [], allowedModulesMap = {}) {
    try {
      const client = getNvidiaClient();
      
      let productConstraintText = '';
      if (allowedProducts && allowedProducts.length > 0) {
        productConstraintText = `\nCRITICAL PRODUCT CONSTRAINTS:\nYou MUST choose the "product" value from this list: ${JSON.stringify(allowedProducts)}. If none match clearly, choose the most relevant one or default to "IT Support".`;
      } else {
        productConstraintText = `\nPRODUCT GUIDANCE:\nIf no specific product matches, default to "IT Support".`;
      }

      let moduleConstraintText = '';
      if (allowedModulesMap && Object.keys(allowedModulesMap).length > 0) {
        moduleConstraintText = `\nCRITICAL MODULE CONSTRAINTS:\nDepending on the chosen product, you MUST select the "module" value from its corresponding list of active modules if present:\n${JSON.stringify(allowedModulesMap, null, 2)}\nDo NOT default to "General" if a matching active module exists (like "Incident", "Policy", or "Compliance" for product GRC). Only default to "General" if there is no suitable match.`;
      } else {
        moduleConstraintText = `\nMODULE GUIDANCE:\nIf no specific component/module matches, default to "General".`;
      }

      const systemPrompt = `You are an expert ITSM analyst routing incoming customer emails.
Analyze the email subject and body carefully.

1. Classify the ticket fields precisely:
- product: The product or system related to the issue.${productConstraintText}
- module: The specific component or module within that product.${moduleConstraintText}
- issueType: MUST be one of ["Incident", "Service Request", "Query", "Complaint"].
  Guidance:
  * "Incident": if something is broken, an error is thrown, a service is slow or down, or there is an access bug.
  * "Service Request": if the user requests something new (e.g. provisioning a user, requesting access, requesting a report).
  * "Query": if the user is asking a question or seeking information.
  * "Complaint": if the user is filing a complaint or escalates an ongoing grievance.
- priority: MUST be one of ["low", "medium", "high", "critical"].
- summary: A professional 1-line summary of the ticket (no greetings/email noise).
- clean_description: A clean, concise, technical description of the problem. You MUST remove all email noise, including greetings (e.g. Hi Team), thank yous, regard lines, signature blocks (names, titles, contact info), and company disclaimer boilerplates. Keep only the technical/core issue description.

2. Structure the data:
You MUST return a valid JSON object matching the schema below:
{
  "product": "...",
  "module": "...",
  "issueType": "...",
  "priority": "...",
  "summary": "...",
  "clean_description": "..."
}`;

      const userPrompt = `Subject: ${subject}\n\nBody: ${body}`;
      const result = await client.jsonResponse(userPrompt, systemPrompt);
      return result;
    } catch (error) {
      console.error('AI Field Extraction Error:', error);
      return {
        product: (allowedProducts && allowedProducts[0]) || 'IT Support',
        module: 'General',
        issueType: 'Incident',
        priority: 'medium',
        summary: subject,
        clean_description: body.substring(0, 1000)
      };
    }
  }

  /**
   * Detects if two emails are about the same issue.
   */
  async detectSimilarity(email1, email2) {
    try {
      const client = getNvidiaClient();
      const systemPrompt = `Compare two support requests and determine if they are about the SAME issue/intent or DIFFERENT issues.
Return JSON: { "isSameIssue": true/false, "confidence": 0-1, "reason": "brief explanation" }`;
      
      const userPrompt = `Email 1 Subject: ${email1.subject}\nEmail 1 Body: ${email1.body}\n\nEmail 2 Subject: ${email2.subject}\nEmail 2 Body: ${email2.body}`;
      
      const result = await client.jsonResponse(userPrompt, systemPrompt);
      return result;
    } catch (error) {
      console.error('AI Similarity Detection Error:', error);
      return { isSameIssue: false, confidence: 0 };
    }
  }
  /**
   * Evaluates an incoming email against a list of active candidate tickets.
   * Determines if the email is a continuation of an existing ticket.
   * 
   * @param {Object} email { subject, body, latest_message, from_email, cc, product, module }
   * @param {Array<Object>} candidates [{ id, issue_title, description, product, module, created_at, status, messages: [...] }]
   */
  async detectContinuation(email, candidates) {
    try {
      if (!candidates || candidates.length === 0) {
        return { decision: 'new', matchedTicketId: null, confidence: 0, reason: 'No active candidate tickets available for comparison.' };
      }

      const client = getNvidiaClient();
      const systemPrompt = `You are an expert ITSM (IT Service Management) analyst.
Your task is to analyze a new incoming support email and determine if it is a continuation or follow-up of an existing open ticket, or if it is a brand-new issue requiring a new ticket.

IMPORTANT MATCHING RULES:
1. PRIORITIZE THE LATEST EMAIL CONTENT: Users often reply with very short follow-ups like "Still facing the same issue", "It is a Sony TV", "Please check again", "Not resolved yet". Treat the 'Latest Message Content' as the highest priority context.
2. SEMANTIC SIMILARITY: Check if the product, module, or core problem matches the candidate tickets. The subject line or email thread might have changed completely, but the underlying issue might be the same.
3. CONTEXT SIGNALS: Use the sender email, organization, product/module similarity, and previous ticket conversation context to make the decision.

Decide between:
- "continuation": If the email is a follow-up, update, or duplication of an existing ticket.
- "new": If the email represents a completely different or new issue.

Return a JSON object with this exact schema:
{
  "decision": "continuation" | "new",
  "matchedTicketId": number | null,
  "confidence": number (between 0.00 and 1.00),
  "reason": "Clear explanation of the decision based on matching signals"
}`;

      // Format candidates for the prompt
      const formattedCandidates = candidates.map(c => {
        const recentMessages = (c.messages || []).map((m, idx) => `  - Msg ${idx + 1} (${m.sender_role}): ${m.body}`).join('\n');
        return `Ticket ID: ${c.id}
Title: ${c.issue_title}
Product: ${c.product || 'N/A'}
Module: ${c.module || 'N/A'}
Status: ${c.status}
Created At: ${c.created_at}
Description: ${c.description}
Recent Conversation:\n${recentMessages || '  (No previous messages)'}`;
      }).join('\n\n---\n\n');

      const userPrompt = `INCOMING EMAIL:
From: ${email.from_email}
CC: ${email.cc || 'None'}
Subject: ${email.subject}
Product Mentioned: ${email.product || 'Unknown'}
Module Mentioned: ${email.module || 'Unknown'}
Latest Message Content (Highest Priority):
"${email.latest_message || email.body}"

Full Email Body:
"${email.body}"

====================================================
ACTIVE CANDIDATE TICKETS:
${formattedCandidates}
====================================================`;

      const result = await client.jsonResponse(userPrompt, systemPrompt);
      return {
        decision: result.decision || 'new',
        matchedTicketId: result.matchedTicketId || null,
        confidence: typeof result.confidence === 'number' ? result.confidence : 0,
        reason: result.reason || 'No reason provided by AI.'
      };
    } catch (error) {
      console.error('AI Continuation Detection Error:', error);
      return { decision: 'new', matchedTicketId: null, confidence: 0, reason: 'AI matching failed or timed out.' };
    }
  }

  /**
   * Generates a combined professional summary for multiple related emails.
   */
  async generateCombinedSummary(emails) {
    try {
      const client = getNvidiaClient();
      const systemPrompt = `You are an expert ITSM analyst. 
Multiple related emails have been received about the same issue.
Synthesize them into ONE professional, concise ticket description.
Remove all email noise (greetings, signatures, etc.).
Focus on the technical progression of the issue.
Return JSON: { "combined_description": "...", "final_summary": "..." }`;

      const userPrompt = emails.map((e, i) => `Email ${i+1}:\nSubject: ${e.subject}\nBody: ${e.body}`).join('\n\n');
      
      const result = await client.jsonResponse(userPrompt, systemPrompt);
      return result;
    } catch (error) {
      console.error('AI Combined Summary Error:', error);
      return { 
        combined_description: emails.map(e => e.body).join('\n---\n'),
        final_summary: emails[0].subject
      };
    }
  }
}

module.exports = new AiExtractionService();
