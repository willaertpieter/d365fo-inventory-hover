// Narration for the promo/tutorial video.
//
// `say` is what the voice speaks. It is written for the ear: "D-three-sixty-five"
// rather than "D365", which the TTS voice otherwise spells out letter by letter.
// `cap` is the on-screen/caption form, when it differs from what is spoken.
//
// {name} inside `say` is a sync marker: it resolves to the moment the voice
// reaches the word right after it, so the visuals can land on that word.
//
// `pre` / `gap` are pauses (seconds) before / after a line; `lead` / `tail`
// are pauses at the start / end of a scene, for visuals that need a moment.

module.exports = {
  voice: 'en-US-AndrewMultilingualNeural',
  gap: 0.35,
  scenes: [
    {
      id: 'hook', chapter: 'Intro', lead: 1.0, tail: 0.5,
      lines: [
        { id: 'h1', say: 'How much stock do we {actually}actually have?', gap: 0.6 },
        { id: 'h2', say: 'In Dynamics 365 Finance and Operations, answering that simple question usually means {leaving}leaving the page you\'re working on.',
          cap: 'In Dynamics 365 Finance and Operations, answering that simple question usually means leaving the page you\'re working on.' }
      ]
    },
    {
      id: 'problem', lead: 0.5, tail: 0.6,
      lines: [
        { id: 'p1', say: '{s1}Open the item. {s2}Go to on-hand inventory. {s3}Filter by warehouse. {s4}Check the numbers. {s5}Then find your way back.', gap: 0.5 },
        { id: 'p2', say: 'For {ol}every order line, {fl}every formula line, {ld}every load. {dozens}Dozens of times a day.' }
      ]
    },
    {
      id: 'reveal', lead: 0.3, tail: 0.8,
      lines: [
        { id: 'r1', say: 'There\'s a faster way.', gap: 0.5 },
        { id: 'r2', say: 'Meet {name}D-three-sixty-five F-and-O Inventory Hover: a {free}free, {privacy}privacy-safe browser extension for {edge}Microsoft Edge.',
          cap: 'Meet D365FO Inventory Hover: a free, privacy-safe browser extension for Microsoft Edge.', gap: 0.45 },
        { id: 'r3', say: 'Hold {alt}Alt, {hover}hover over any item number, and {answer}the answer appears right where you are.' }
      ]
    },
    {
      id: 'sales', chapter: 'See stock instantly', lead: 0.8, tail: 0.6,
      lines: [
        { id: 'd1', say: 'Here\'s a sales order in Finance and Operations.', gap: 0.3 },
        { id: 'd2', say: 'Hold {alt}Alt, and {hover}hover over an item number.', gap: 1.0 },
        { id: 'd3', say: 'That\'s it. {noclicks}No clicks, no new tabs, no waiting for another form to load.', gap: 0.5 },
        { id: 'd4', say: 'At the top: the item number and product name.' },
        { id: 'd5', say: 'Below it, the product details that matter to your team: {fields}inventory unit, item model group, tracking dimensions, production type, filter codes, and more.' },
        { id: 'd6', say: 'Then the stock itself, per warehouse: {phys}physical, {avail}available, {res}reserved, {ord}ordered, and {onord}on order. {color}Color-coded, so you can read it at a glance.', gap: 0.5 },
        { id: 'd7', say: '{move}Move away, and it\'s {gone}gone. Your order is exactly where you left it.' }
      ]
    },
    {
      id: 'formula', chapter: 'Production & BOM lines', lead: 1.2, tail: 0.6,
      lines: [
        { id: 'e1', say: 'It works wherever item numbers appear.', gap: 0.3 },
        { id: 'e2', say: 'Planning production? {check}Check every ingredient and packaging component right from the formula or bill of materials lines, {including}including what\'s already {onorder}on order, before you release the order to the floor.', gap: 0.6 },
        { id: 'e3', say: 'And {nostock}when an item has no stock at all, you still get its product details, {note}with a clear note instead of an empty table.' }
      ]
    },
    {
      id: 'load', chapter: 'Warehouse & legal entities', lead: 1.2, tail: 0.6,
      lines: [
        { id: 'f1', say: 'In warehouse management, {check}check a load line in seconds.', gap: 0.9 },
        { id: 'f2', say: 'Lookups always follow the legal entity {url}in your page address, {switch}even right after you switch company.', gap: 0.5 },
        { id: 'f3', say: 'Running several legal entities? {open}Open the extension, switch on {toggle}cross-company inventory, and {shows}the tooltip shows stock across every company in the environment, with a {company}company column added automatically.', gap: 0.5 },
        { id: 'f4', say: 'Product dimensions, such as configuration, color, size, style and {version}version, only get a column when the item actually uses them.' }
      ]
    },
    {
      id: 'setup', chapter: 'Set up in under a minute', lead: 0.6, tail: 0.6,
      lines: [
        { id: 'g1', say: 'Getting started takes less than a minute.', gap: 0.6 },
        { id: 'g2', say: '{install}Install Inventory Hover from the Microsoft Edge {store}Add-ons store. {link}The link is in the description.', gap: 0.6 },
        { id: 'g3', say: '{pin}Pin it to your toolbar, so its settings are always {oneclick}one click away.', gap: 0.6 },
        { id: 'g4', say: 'Then simply {open}open Finance and Operations. {nothing}There\'s nothing to configure. {envs}The extension recognizes every Microsoft-hosted environment: {prod}production, {sandbox}sandbox and {dev}cloud-hosted development machines, {region}in every region. And it always works with {tab}the environment in the tab you\'re on.', gap: 0.5 },
        { id: 'g5', say: 'On your very {first}first hover, it reads {reads}the product fields available in your own environment, {custom}including your custom extension fields, and starts with {twenty}a practical set of twenty standard fields.', gap: 0.6 },
        { id: 'g6', say: 'Using a {custom}custom address? {open}Open the popup and click {enable}Enable on this site. Your browser {prompt}asks permission for that one site only, and {ready}you\'re ready to go.' }
      ]
    },
    {
      id: 'popup', chapter: 'The toolbar popup', lead: 0.8, tail: 0.5,
      lines: [
        { id: 'k1', say: 'The toolbar popup keeps you in control.', gap: 0.4 },
        { id: 'k2', say: '{refresh}Refresh inventory data clears cached lookups, so your next hover asks D-three-sixty-five again.',
          cap: 'Refresh inventory data clears cached lookups, so your next hover asks D365 again.', gap: 0.4 },
        { id: 'k3', say: 'The {cross}cross-company switch flips between the legal entity you\'re viewing and {all}all companies at once.', gap: 0.4 },
        { id: 'k4', say: '{stats}Query statistics count your lookups. And {log}Recent queries is a local audit trail: {click}click any entry to see the exact O Data request and response, and {copy}copy it with one click when you need to troubleshoot.',
          cap: 'Query statistics count your lookups. And Recent queries is a local audit trail: click any entry to see the exact OData request and response, and copy it with one click when you need to troubleshoot.' }
      ]
    },
    {
      id: 'options', chapter: 'Configure the tooltip', lead: 0.6, tail: 0.6,
      lines: [
        { id: 'o1', say: 'Click {configure}Configure tooltip to decide {exactly}exactly what you see.', gap: 0.5 },
        { id: 'o2', say: '{show}Show, {hide}hide and {reorder}reorder the quantity columns.', gap: 0.6 },
        { id: 'o3', say: '{search}Search every product field in your environment, and {add}add any of them with a single click.', gap: 0.5 },
        { id: 'o4', say: '{reorder}Reorder them, or simply {rename}type over a name to give it a label your team recognizes.', gap: 0.6 },
        { id: 'o5', say: '{hide}Hide empty fields, {layout}choose a one or two column layout, and {share}share your configuration with colleagues, so {team}the whole team sees the same view.' }
      ]
    },
    {
      id: 'privacy', chapter: 'Privacy & performance', lead: 0.6, tail: 0.8,
      lines: [
        { id: 'q1', say: 'Inventory Hover is {safe}privacy-safe by design.', gap: 0.4 },
        { id: 'q2', say: '{own}It talks only to your own D-three-sixty-five environment, {signin}using the sign-in you already have. {never}It never collects, stores or sends your data anywhere else. {notrack}No tracking, no analytics, no external servers.',
          cap: 'It talks only to your own D365 environment, using the sign-in you already have. It never collects, stores or sends your data anywhere else. No tracking, no analytics, no external servers.', gap: 0.4 },
        { id: 'q3', say: '{roles}And it only shows what your security roles already allow.', gap: 0.6 },
        { id: 'q4', say: '{light}It\'s light on your environment, too. {alt}It only queries while you hold Alt, {cache}caches results for five minutes, {select}fetches just the fields you selected, and {limit}never makes more than thirty lookups a minute.' }
      ]
    },
    {
      id: 'outro', chapter: 'Get it free', lead: 0.5, tail: 7.0,
      lines: [
        { id: 'z1', say: 'D-three-sixty-five F-and-O Inventory Hover.', cap: 'D365FO Inventory Hover.', gap: 0.4 },
        { id: 'z2', say: '{free}Free, and it always will be. {privacy}Privacy-safe. And {built}built for the people who work in Finance and Operations every day.', gap: 0.5 },
        { id: 'z3', say: '{install}Install it from the link in the description, and get your answers {without}without ever leaving the page.' }
      ]
    }
  ]
};
