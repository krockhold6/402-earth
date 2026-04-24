import type { LegalPageEn } from "./types"

/**
 * English Terms of Service. Source of truth for /terms; update dates here when terms change.
 */
export const TERMS_OF_SERVICE_EN: LegalPageEn = {
  effectiveDate: "April 23, 2026",
  lastUpdated: "April 23, 2026",
  preface: [
    "Welcome to 402 (the “Service”), operated by Kyle Rockhold (“402,” “we,” “us,” or “our”). 402 is currently operated by Kyle Rockhold personally and not yet through a separate incorporated entity. These Terms of Service (“Terms”) govern your access to and use of 402.earth, related websites, applications, APIs, seller tools, MCP exposure features, payment flows, and any related services we provide.",
    "By accessing or using the Service, you agree to these Terms. If you do not agree, do not use the Service.",
  ],
  sections: [
    {
      title: "1. What 402 Does",
      blocks: [
        {
          type: "p",
          text: "402 provides infrastructure that lets users create, sell, buy, expose, access, and execute paid digital resources and paid capabilities. Depending on the feature, 402 may support:",
        },
        {
          type: "ul",
          items: [
            "paid access to files, pages, links, downloads, or other digital resources;",
            "paid execution of capabilities, APIs, tools, prompts, or other programmable actions;",
            "browser-based, API-based, and MCP-based access patterns;",
            "payment-gated delivery, execution, receipts, outcome pages, and result retrieval;",
            "seller-facing management tools for trust, lifecycle, policy, notifications, analytics, and operations.",
          ],
        },
        {
          type: "p",
          text: "402 is a platform provider. Unless expressly stated otherwise, 402 does not create, own, endorse, or control the underlying seller content, endpoints, tools, or outputs made available through the Service.",
        },
      ],
    },
    {
      title: "2. Eligibility",
      blocks: [
        {
          type: "p",
          text: "You may use the Service only if:",
        },
        {
          type: "ul",
          items: [
            "you can form a binding contract with us;",
            "you are not barred from using the Service under applicable law;",
            "you comply with these Terms and all applicable laws and regulations.",
          ],
        },
        {
          type: "p",
          text: "If you use the Service on behalf of a company or other entity, you represent that you have authority to bind that entity.",
        },
      ],
    },
    {
      title: "3. Accounts, Access, and Seller Control",
      blocks: [
        {
          type: "p",
          text: "Some parts of the Service may be used without a traditional user account. Other parts, especially seller-facing capability management features, may require authentication, wallet-based authorization, signed challenges, API credentials, or other access controls.",
        },
        {
          type: "p",
          text: "You are responsible for:",
        },
        {
          type: "ul",
          items: [
            "maintaining the security of your account, wallet, credentials, keys, and devices;",
            "all activity under your credentials or authorization context;",
            "ensuring that only authorized persons manage your seller resources and capabilities.",
          ],
        },
        {
          type: "p",
          text: "We may suspend or restrict access if we believe your account, wallet, or activity presents a security, fraud, abuse, legal, or operational risk.",
        },
      ],
    },
    {
      title: "4. Seller Content, Capabilities, and Responsibilities",
      blocks: [
        {
          type: "p",
          text: "If you create, publish, or sell a resource or capability through 402, you are solely responsible for:",
        },
        {
          type: "ul",
          items: [
            "the legality, accuracy, safety, and reliability of what you offer;",
            "your endpoint behavior, outputs, prompts, resources, descriptions, and metadata;",
            "your trust configuration, policies, notification settings, and lifecycle controls;",
            "obtaining all rights, consents, permissions, and licenses needed for your offering;",
            "complying with consumer protection, privacy, IP, payments, export, sanctions, and other applicable laws.",
          ],
        },
        {
          type: "p",
          text: "You represent and warrant that your resources and capabilities, and any content or functionality associated with them, do not:",
        },
        {
          type: "ul",
          items: [
            "violate any law or regulation;",
            "infringe, misappropriate, or violate any third-party rights;",
            "include malware, deceptive code, or harmful payloads;",
            "facilitate fraud, abuse, unauthorized surveillance, or illegal access;",
            "promote or enable prohibited goods, services, or conduct.",
          ],
        },
        {
          type: "p",
          text: "We may remove, block, disable, delist, or restrict any resource, capability, account, endpoint, or activity at our discretion if we believe it violates these Terms, creates risk, or harms users, us, or third parties.",
        },
      ],
    },
    {
      title: "5. Buyers and Purchases",
      blocks: [
        {
          type: "p",
          text: "If you purchase or access a resource or capability through 402:",
        },
        {
          type: "ul",
          items: [
            "you are responsible for reviewing the listing, pricing, and any seller-provided terms or descriptions;",
            "you acknowledge that the underlying resource, endpoint, tool, or result may be provided by a third-party seller, not by 402;",
            "access or execution may depend on availability, policy controls, lifecycle state, trust gating, retention windows, or other conditions;",
            "a successful payment may grant access, execution, or a result, but not ownership of the platform, code, or seller IP unless expressly stated.",
          ],
        },
        {
          type: "p",
          text: "For capabilities in particular, you understand that outcome delivery may vary by mode, including direct, protected, or async execution, and that results may be preview-only, retained for a limited time, expired, deleted, unavailable, or subject to storage limits.",
        },
      ],
    },
    {
      title: "6. Payments",
      blocks: [
        {
          type: "p",
          text: "Payments on 402 may be processed through wallet-based flows, stablecoin payment flows, x402-style payment challenges, third-party processors, or other supported rails.",
        },
        {
          type: "p",
          text: "By initiating a payment, you authorize the applicable transaction. You are responsible for:",
        },
        {
          type: "ul",
          items: [
            "verifying wallet addresses, payment amounts, and transaction details;",
            "any fees, gas, network costs, taxes, or third-party charges;",
            "ensuring the payment method you use is lawful and authorized.",
          ],
        },
        {
          type: "p",
          text: "Unless required by law or expressly stated by us, payments are final and non-refundable once access has been granted, execution has begun, or a result has been delivered.",
        },
        {
          type: "p",
          text: "We do not guarantee reversibility of blockchain or other irreversible payment mechanisms.",
        },
      ],
    },
    {
      title: "7. Platform Fees",
      blocks: [
        {
          type: "p",
          text: "We may charge platform fees, service fees, infrastructure fees, or other transaction-based fees for use of the Service. We may change fees at any time by updating pricing, fee schedules, or applicable platform documentation.",
        },
      ],
    },
    {
      title: "8. Capabilities, APIs, and MCP Exposure",
      blocks: [
        {
          type: "p",
          text: "402 may allow sellers to expose capabilities through APIs, MCP-compatible surfaces, or both. These are interface layers only. 402 does not guarantee that every capability will be suitable for every client, agent, or runtime.",
        },
        {
          type: "p",
          text: "We may impose:",
        },
        {
          type: "ul",
          items: [
            "lifecycle restrictions;",
            "trust requirements;",
            "cooldowns, concurrency controls, or usage caps;",
            "temporary pauses or failure protections;",
            "storage, retention, or retrieval limits;",
            "notification, observability, or operational safeguards.",
          ],
        },
        {
          type: "p",
          text: "We reserve the right to change, limit, suspend, or discontinue any integration, exposure layer, or access mechanism at any time.",
        },
      ],
    },
    {
      title: "9. Availability, Uptime, and No Guarantee of Continuous Service",
      blocks: [
        {
          type: "p",
          text: "We aim to provide a reliable platform, but we do not guarantee uninterrupted, error-free, or always-available service.",
        },
        {
          type: "p",
          text: "Resources or capabilities may become unavailable due to:",
        },
        {
          type: "ul",
          items: [
            "seller actions;",
            "endpoint failures;",
            "policy controls;",
            "trust restrictions;",
            "infrastructure outages;",
            "storage expiration or cleanup;",
            "maintenance, upgrades, or abuse prevention;",
            "third-party service interruptions.",
          ],
        },
      ],
    },
    {
      title: "10. Acceptable Use",
      blocks: [
        {
          type: "p",
          text: "You may not use the Service to:",
        },
        {
          type: "ul",
          items: [
            "violate any law or regulation;",
            "infringe intellectual property or privacy rights;",
            "engage in fraud, phishing, impersonation, or deception;",
            "distribute malware or malicious code;",
            "probe, scan, exploit, or attack the Service or other users;",
            "bypass, disable, or interfere with trust controls, policy controls, payment gating, or access controls;",
            "overload, scrape, or abuse the Service beyond permitted use;",
            "use the Service for prohibited, dangerous, or illegal goods or services.",
          ],
        },
        {
          type: "p",
          text: "We may investigate and take action, including suspension, blocking, removal, preservation of records, and cooperation with law enforcement or regulators.",
        },
      ],
    },
    {
      title: "11. Intellectual Property",
      blocks: [
        {
          type: "p",
          text: "The Service, including our software, branding, layout, platform features, and documentation, is owned by us or our licensors and is protected by law.",
        },
        {
          type: "p",
          text: "Except as expressly allowed, these Terms do not grant you any ownership rights in 402.",
        },
        {
          type: "p",
          text: "You retain ownership of content and materials you submit, to the extent you have such rights. You grant us a limited license to host, store, process, display, transmit, and use your content as necessary to operate, secure, improve, and provide the Service.",
        },
      ],
    },
    {
      title: "12. Feedback",
      blocks: [
        {
          type: "p",
          text: "If you provide feedback, ideas, or suggestions, we may use them without restriction or compensation to you.",
        },
      ],
    },
    {
      title: "13. Data, Logs, and Operational Records",
      blocks: [
        {
          type: "p",
          text: "We may store and process operational records related to resources, capabilities, payments, attempts, jobs, results, notifications, trust states, analytics, and audit events to operate, secure, support, and improve the Service.",
        },
      ],
    },
    {
      title: "14. Third-Party Services",
      blocks: [
        {
          type: "p",
          text: "The Service may depend on or interoperate with third-party services, including wallets, payment networks, cloud infrastructure, storage, AI clients, APIs, email providers, webhook targets, analytics tools, or seller-controlled endpoints.",
        },
        {
          type: "p",
          text: "We are not responsible for third-party services, their availability, or their acts or omissions.",
        },
      ],
    },
    {
      title: "15. Disclaimers",
      blocks: [
        {
          type: "p",
          text: "THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING OUT OF COURSE OF DEALING OR USAGE OF TRADE.",
        },
        {
          type: "p",
          text: "We do not warrant that:",
        },
        {
          type: "ul",
          items: [
            "the Service will be uninterrupted, secure, or error-free;",
            "payments, deliveries, executions, or results will always succeed;",
            "seller-provided resources, endpoints, or outputs are accurate, lawful, or fit for your needs;",
            "any result or output will be retained for any specific duration unless expressly stated.",
          ],
        },
      ],
    },
    {
      title: "16. Limitation of Liability",
      blocks: [
        {
          type: "p",
          text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, 402 AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, AND LICENSORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR RELATED TO THE SERVICE.",
        },
        {
          type: "p",
          text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR AGGREGATE LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF:",
        },
        {
          type: "ul",
          items: [
            "THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM; OR",
            "USD $100.",
          ],
        },
        {
          type: "p",
          text: "Some jurisdictions do not allow certain limitations, so parts of this section may not apply to you.",
        },
      ],
    },
    {
      title: "17. Indemnification",
      blocks: [
        {
          type: "p",
          text: "You agree to defend, indemnify, and hold harmless 402 and its affiliates, officers, directors, employees, contractors, and licensors from and against any claims, liabilities, damages, judgments, losses, costs, and expenses, including reasonable attorneys’ fees, arising out of or related to:",
        },
        {
          type: "ul",
          items: [
            "your use of the Service;",
            "your resources, capabilities, endpoints, outputs, or content;",
            "your violation of these Terms or applicable law;",
            "your infringement or violation of any third-party rights.",
          ],
        },
      ],
    },
    {
      title: "18. Suspension and Termination",
      blocks: [
        {
          type: "p",
          text: "We may suspend, restrict, or terminate your access to the Service at any time, with or without notice, if we believe:",
        },
        {
          type: "ul",
          items: [
            "you violated these Terms;",
            "your activity creates legal, security, fraud, or operational risk;",
            "we are required to do so by law;",
            "continuing to provide the Service is no longer commercially or technically feasible.",
          ],
        },
        {
          type: "p",
          text: "You may stop using the Service at any time.",
        },
        {
          type: "p",
          text: "Sections that by their nature should survive termination will survive, including ownership, disclaimers, limitations of liability, indemnification, dispute terms, and any accrued payment obligations.",
        },
      ],
    },
    {
      title: "19. Changes to the Service or Terms",
      blocks: [
        {
          type: "p",
          text: "We may modify the Service or these Terms at any time. If we make material changes, we may provide notice by posting the updated Terms, updating the date above, or using another reasonable method. Your continued use of the Service after the effective date of updated Terms constitutes acceptance.",
        },
      ],
    },
    {
      title: "20. Governing Law and Disputes",
      blocks: [
        {
          type: "p",
          text: "These Terms are governed by the laws of Ohio, United States, without regard to conflict of laws rules.",
        },
        {
          type: "p",
          text: "Any dispute arising from or relating to these Terms or the Service will be resolved in the state or federal courts located in Warren County, Ohio, United States, and you consent to personal jurisdiction and venue there.",
        },
        {
          type: "p",
          text: "Optional arbitration clause placeholder: If you want arbitration instead of court litigation, replace this section with a properly drafted arbitration clause tailored to your jurisdiction and business needs.",
        },
      ],
    },
    {
      title: "21. Contact",
      blocks: [
        {
          type: "p",
          text: "For questions about these Terms, contact:",
        },
        {
          type: "p",
          text: "Kyle Rockhold",
        },
        {
          type: "p",
          text: "[Your mailing address here]",
        },
        {
          type: "p",
          text: "support@402.earth",
        },
      ],
    },
  ],
}
