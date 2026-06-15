/**
 * High-fidelity email cleaning utility.
 * Strips out greetings, signatures, sign-offs, and footer/disclaimer boilerplate
 * to yield a clean, technical ticket description.
 */

function cleanEmailBody(body) {
  if (!body || typeof body !== 'string') return '';

  // 1. Normalize line endings
  let text = body.replace(/\r\n/g, '\n').trim();

  // 2. Split into lines
  const lines = text.split('\n');
  const cleanedLines = [];
  let isTrashing = false;

  // Common greetings regex
  const greetingRegex = /^(hi|hello|dear|hey|good\s+morning|good\s+afternoon|good\s+evening)\b/i;

  // Common sign-offs regex (short lines starting with standard sign-offs)
  const signoffRegex = /^(thanks\s+&\s+regards|thanks\s+and\s+regards|best\s+regards|kind\s+regards|warm\s+regards|regards|sincerely|thank\s+you|thanks|cheers|best|yours\s+truly)([\s,.:]|$)/i;

  // Common footnote/disclaimer markers
  const disclaimerRegex = /(confidentiality\s+notice|this\s+email\s+is\s+confidential|this\s+transmission\s+may\s+contain|please\s+consider\s+the\s+environment|disclaimer:)/i;

  // Signature separator (traditional '--')
  const sigSeparatorRegex = /^--\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // If we've hit a known signature, sign-off, or disclaimer, truncate everything after
    if (sigSeparatorRegex.test(line) || disclaimerRegex.test(line)) {
      break;
    }

    // Check for short sign-off lines (e.g. "Regards," or "Thanks & Regards")
    if (signoffRegex.test(line) && line.length < 40) {
      // Lookahead: check if the remaining lines are mostly short (typical for a signature block)
      let shortLinesAhead = 0;
      let totalLinesAhead = 0;
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        const nextLine = lines[j].trim();
        if (nextLine.length > 0) {
          totalLinesAhead++;
          if (nextLine.length < 40) shortLinesAhead++;
        }
      }
      // If indeed followed by signature block characteristics, truncate here
      if (totalLinesAhead === 0 || (shortLinesAhead / totalLinesAhead) >= 0.6) {
        break;
      }
    }

    // Skip greetings on the first few lines of the email
    if (cleanedLines.length < 3 && greetingRegex.test(line) && line.length < 35) {
      continue;
    }

    cleanedLines.push(lines[i]);
  }

  // Join lines and clean up whitespace
  let cleaned = cleanedLines.join('\n').trim();

  // If cleaning ended up emptying the text (e.g. email was extremely short), return original body
  if (cleaned.length < 10) {
    return body.trim();
  }

  return cleaned;
}

module.exports = { cleanEmailBody };
