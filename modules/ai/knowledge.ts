export type SupportArticle = {
  id: string;
  title: string;
  body: string;
  tags: string[];
};

export const supportArticles: SupportArticle[] = [
  {
    id: "KB-DEMO-REFUND",
    title: "Demo refund window",
    body: "Delivered demo orders can be reviewed for a refund until the refund window on that order ends. Zep does not move money. A person has to complete a refund outside this chat.",
    tags: ["refund", "return", "money"],
  },
  {
    id: "KB-DEMO-DELIVERY",
    title: "Demo delivery statuses",
    body: "Demo orders move through placed, packed, out for delivery, and delivered. The status in your account is the only delivery fact the assistant can use. Zep is not connected to a live courier or to Zepto.",
    tags: ["delivery", "tracking", "status", "where"],
  },
  {
    id: "KB-DEMO-CANCEL",
    title: "Cancellation policy",
    body: "A demo order can only be considered for cancellation while it is still placed. Packed, out-for-delivery, and delivered orders are not cancelled in this demo. The assistant cannot cancel an order itself.",
    tags: ["cancel", "cancellation", "order"],
  },
];

export function searchSupportArticles(query: string) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);

  const matches = supportArticles.filter((article) => {
    const haystack = `${article.title} ${article.body} ${article.tags.join(" ")}`.toLowerCase();
    return terms.length === 0 || terms.some((term) => haystack.includes(term));
  });

  return matches.slice(0, 3);
}
