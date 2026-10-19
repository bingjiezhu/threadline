// Query cleanup is deliberately lexical. It does not interpret stored instructions or call a model.
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('en-US');
const stopWords = new Set(('a an and are as at be before can could did do does for from give had has have how i in is it me my of on or please remember should tell that the their them there they this to was were what when where which who why will with would you your about into say says said ' +
    'search find look looking lookup up retrieve recall show summarize summary explain saved imported local memory memories note notes file files source sources content contents').split(' '));

export function memoryWord(value) {
    const word = normalize(value);
    // Small, explicit English variants; filenames such as feedback_language_preferences.md also match.
    const variants = { preferences: 'preference', prefer: 'preference', prefers: 'preference', preferred: 'preference', preferring: 'preference', promised: 'promise', promises: 'promise', promising: 'promise', working: 'work', works: 'work', styles: 'style', languages: 'language' };
    return variants[word] || (word.length > 5 && word.endsWith('ies') ? word.slice(0, -3) + 'y' : word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);
}

export function memoryQueryTerms(query) {
    return [...new Set((normalize(query).match(/[\p{L}\p{N}]+/gu) || []).filter(word => word.length > 1 && !stopWords.has(word)).map(memoryWord))].slice(0, 40);
}

/** Only an explicit memory-source reference scopes a query. A topic merely mentioning Claude does not. */
export function analyzeMemoryQuery(question) {
    let query = String(question || '');
    const providers = new Set();
    const take = phrase => { for (const match of phrase.matchAll(/\b(codex|claude)\b/gi)) providers.add(match[1].toLowerCase()); return ' '; };
    const names = '(?:codex|claude(?:\\s+code)?)(?:\\s*(?:and|or|&|,|/|和|与|及)\\s*(?:codex|claude(?:\\s+code)?))?';
    const memory = '(?:memor(?:y|ies)|notes?|files?|记忆|记录)';
    query = query.replace(new RegExp(`\\b${names}\\s*(?:['’]s\\s*)?(?:local\\s+)?${memory}`, 'gi'), take);
    query = query.replace(new RegExp(`${memory}\\s+(?:from|in|of)\\s+(?:my\\s+)?${names}\\b`, 'gi'), take);
    query = query.replace(new RegExp(`\\b${names}\\s+(?:remember|know)(?:s)?\\b`, 'gi'), take);
    query = query.replace(new RegExp(`\\b${names}\\s*(?:里|中|的)(?:的)?\\s*${memory}`, 'gi'), take);
    // "My Claude working-style-pragmatic memory" names a provider and a topic/file.
    // Bound the intervening phrase and forbid crossing sentences; keep it as search content.
    query = query.replace(new RegExp(`\\b(?:my|imported|saved|local)\\s+(${names})\\s+((?:(?![.!?]\\s)[^\\r\\n]){1,100}?)\\s+${memory}\\b`, 'gi'), (whole, providerNames, topic) => {
        if (topic.trim().split(/\s+/).length > 12) return whole;
        take(providerNames);
        return ` ${topic} `;
    });
    query = query.replace(/(?:请|帮我|查询|查找|检索|搜索|查看|找一下|查一下|关于|里面|之中|中的|里的|内容|记忆|记录)/gu, ' ');
    const semantic = memoryQueryTerms(query);
    return { query: semantic.join(' '), providers: [...providers].sort() };
}

export function isMemoryRecallRequest(value) {
    const text = String(value || '').trim();
    if (/^(?:please\s+)?(?:remember this|save this|note this|remind me|draft\b|(?:create|add)\s+(?:a\s+)?task\b|记住|记录一下|保存|提醒我|创建任务)/i.test(text)) return false;
    if (analyzeMemoryQuery(text).providers.length) return true;
    return /(?:\b(?:search|find|retrieve|recall|show|what|which|tell|look up)\b[\s\S]*\b(?:memor(?:y|ies)|saved (?:notes?|content)|imported (?:notes?|files?))\b|(?:查询|检索|搜索|查找|查看)[\s\S]*(?:记忆|记录))/i.test(text);
}
