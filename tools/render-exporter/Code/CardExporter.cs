using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Godot;
using MegaCrit.Sts2.Core.Models;
using MegaCrit.Sts2.Core.Nodes.Cards;
using MegaCrit.Sts2.Core.Entities.Cards;
using MegaCrit.Sts2.Core.Localization;

namespace RenderExporter;

// Renders every queued card with the game's own NCard renderer into PNGs, one
// per language. A typed reimplementation of spire-compendium/payload/Payload.cs's
// card export: same algorithm, but as a loaded mod it calls the game API directly
// (no assembly scanning, no main-thread marshalling - a Node already ticks on the
// main thread). Driven by env vars set by the render container:
//   STS2_RENDER_OUT     output base dir (required; arms the exporter)
//   STS2_RENDER_CARDS   "all" or a comma list of card ids (default "all")
//   STS2_RENDER_PREFIX  only ids starting with this (e.g. "WATCHER-") to export
//                       ONLY a mod's cards, not the whole base catalog
//   STS2_RENDER_LANGS   comma list of "folder=locale" / folders (default English)
//   STS2_RENDER_ENCH    "1" to also render every valid enchantment (heavy)
public partial class CardExporter : Node
{
    private string _baseOut = "";
    private string _outDir = "";
    private readonly List<(string id, bool upg, string? ench)> _queue = new();
    private readonly List<(string folder, string locale)> _langs = new();
    private readonly Dictionary<string, CardModel> _models = new();
    private readonly Dictionary<string, EnchantmentModel> _ench = new();
    private int _qi, _li;

    // Two-phase capture: a card is set up on one tick and captured on the next,
    // so the viewport has actually drawn a frame.
    private SubViewport? _pendingVp;
    private string _pendingBase = "";
    private AnimatedSprite2D? _pendingFire;
    private int _pendingFrame, _pendingFrames = 1;
    private bool _done;

    public override void _Ready()
    {
        try { Build(); }
        catch (Exception e) { Log("build failed: " + e); _done = true; }
    }

    private void Build()
    {
        _baseOut = Environment.GetEnvironmentVariable("STS2_RENDER_OUT") ?? "";
        Directory.CreateDirectory(_baseOut);

        foreach (var cm in ModelDb.AllCards)
            _models[cm.Id.Entry.ToLowerInvariant()] = cm;
        try
        {
            foreach (var em in ModelDb.DebugEnchantments)
            {
                var e = em.Id.Entry.ToLowerInvariant();
                if (e.StartsWith("deprecated") || e.StartsWith("mock")) continue;
                _ench[e] = em;
            }
        }
        catch (Exception e) { Log("enchantment load: " + e); }

        BuildLangs();

        var prefix = (Environment.GetEnvironmentVariable("STS2_RENDER_PREFIX") ?? "").ToLowerInvariant();
        var spec = (Environment.GetEnvironmentVariable("STS2_RENDER_CARDS") ?? "all").Trim();
        IEnumerable<string> ids = spec.Equals("all", StringComparison.OrdinalIgnoreCase)
            ? _models.Keys
            : spec.Split(new[] { ',', ' ', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                  .Select(s => s.Trim().ToLowerInvariant());
        if (prefix.Length > 0) ids = ids.Where(i => i.StartsWith(prefix));
        var idList = ids.Where(_models.ContainsKey).Distinct().OrderBy(s => s).ToList();

        bool doEnch = Environment.GetEnvironmentVariable("STS2_RENDER_ENCH") == "1";
        foreach (var id in idList)
        {
            var m = _models[id];
            _queue.Add((id, false, null));
            if (m.IsUpgradable) _queue.Add((id, true, null));
            if (!doEnch) continue;
            foreach (var (ekey, em) in _ench)
            {
                if (!em.CanEnchant(m)) continue;
                _queue.Add((id, false, ekey));
                if (m.IsUpgradable) _queue.Add((id, true, ekey));
            }
        }
        Log($"queued {_queue.Count} renders x {_langs.Count} langs ({idList.Count} cards)");

        // NCard.Create pulls from a NodePool that may not be primed at the menu.
        NCard.InitPool();
        SetGameLocale(_langs[0].locale);
        _outDir = Path.Combine(_baseOut, _langs[0].folder);
        Directory.CreateDirectory(_outDir);
    }

    public override void _Process(double delta)
    {
        if (_done) return;
        try { Tick(); }
        catch (Exception e) { Log("tick: " + e); }
    }

    private void Tick()
    {
        if (_pendingVp != null)
        {
            var path = _pendingFrames > 1 ? $"{_pendingBase}.f{_pendingFrame}.png" : $"{_pendingBase}.png";
            Capture(_pendingVp, path);
            _pendingFrame++;
            if (_pendingFire != null && _pendingFrame < _pendingFrames)
            {
                _pendingFire.Frame = _pendingFrame; // advance flame; capture next tick
                return;
            }
            _pendingVp.QueueFree();
            _pendingVp = null;
            _pendingFire = null;
        }

        if (_qi < _queue.Count)
        {
            var (id, upg, ench) = _queue[_qi++];
            Setup(id, upg, ench);
            if (_qi % 25 == 0) Log($"lang {_li + 1}/{_langs.Count} {_qi}/{_queue.Count}");
        }
        else if (_li + 1 < _langs.Count)
        {
            File.WriteAllText(Path.Combine(_outDir, "_done.txt"), $"{_queue.Count}");
            _li++;
            SetGameLocale(_langs[_li].locale);
            _outDir = Path.Combine(_baseOut, _langs[_li].folder);
            Directory.CreateDirectory(_outDir);
            _qi = 0;
            Log($"locale -> {_langs[_li].locale} ({(_langs[_li].folder == "" ? "eng" : _langs[_li].folder)})");
        }
        else
        {
            File.WriteAllText(Path.Combine(_outDir, "_done.txt"), $"{_queue.Count}");
            File.WriteAllText(Path.Combine(_baseOut, "_all_done.txt"), $"{_langs.Count} languages x {_queue.Count}");
            Log($"ALL DONE: {_langs.Count} languages x {_queue.Count} renders");
            _done = true;
            GetTree().Quit(); // clean exit; the container also kills as a fallback
        }
    }

    private void Setup(string id, bool upg, string? ench)
    {
        if (!_models.TryGetValue(id, out var model)) { Log("no model: " + id); return; }
        CardModel cm = model;
        // Upgrade / enchant mutate the model, so work on a clone.
        if (upg || ench != null) cm = model.ToMutable();
        // Upgrade but do NOT FinalizeUpgradeInternal - finalizing clears the
        // per-var "just upgraded" flag that makes changed values render green.
        if (upg) cm.UpgradeInternal();
        if (ench != null && _ench.TryGetValue(ench, out var enchCanonical))
        {
            // Mirror NEnchantPreview.Init: clone, apply at >=1 amount, flag preview, modify.
            var em = enchCanonical.ToMutable();
            decimal amount = enchCanonical.Amount;
            if (amount < 1m) amount = 1m;
            cm.EnchantInternal(em, amount);
            cm.IsEnchantmentPreview = true;
            em.ModifyCard();
        }

        var card = NCard.Create(cm, ModelVisibility.Visible);
        if (card == null) { Log("Create null: " + id); return; }

        // Roomy viewport; card centre at (210,276) so the orb / star / banner /
        // flame overhang doesn't clip (content is 300x422 centred on origin).
        var vp = MakeViewport(400, 520);
        card.Position = new Vector2(210, 276);
        vp.AddChild(card);
        AddChild(vp);

        // Broken-Card fix: Create() set Model before the node was in the tree, so
        // Reload() ran with null label refs. Re-apply Model now that _Ready wired
        // them, then UpdateVisuals for title/cost/description.
        card.Model = null;
        card.Model = cm;
        card.UpdateVisuals(PileType.None, upg ? CardPreviewMode.Upgrade : CardPreviewMode.Normal);

        _pendingVp = vp;
        var fileBase = id + (upg ? "_upg" : "");
        if (ench != null)
        {
            var enchDir = Path.Combine(_outDir, "ench", ench);
            Directory.CreateDirectory(enchDir);
            _pendingBase = Path.Combine(enchDir, fileBase);
        }
        else
        {
            _pendingBase = Path.Combine(_outDir, fileBase);
        }
        _pendingFire = null;
        _pendingFrame = 0;
        _pendingFrames = 1;

        // Ancient cards have an animated flame (AnimatedSprite2D "Fire"); capture
        // each sprite frame so the export can become an animated webp.
        if (model.Rarity.ToString() == "Ancient")
        {
            var fire = FindFire(card);
            if (fire != null)
            {
                fire.Playing = false;
                var n = fire.SpriteFrames?.GetFrameCount("default") ?? 1;
                if (n > 1) { _pendingFire = fire; _pendingFrames = n; fire.Frame = 0; }
            }
            else { Log(id + ": ancient but no Fire node"); }
        }
    }

    private static SubViewport MakeViewport(int w, int h) => new()
    {
        Size = new Vector2I(w, h),
        TransparentBg = true,
        Disable3D = true,
        RenderTargetUpdateMode = SubViewport.UpdateMode.Always,
        RenderTargetClearMode = SubViewport.ClearMode.Always,
    };

    private static void Capture(SubViewport vp, string path)
    {
        var img = vp.GetTexture()?.GetImage();
        if (img == null) { Log("no image: " + path); return; }
        img.SavePng(path);
    }

    private static AnimatedSprite2D? FindFire(Node node)
    {
        foreach (var child in node.GetChildren())
        {
            if (child is AnimatedSprite2D a && child.Name == "Fire") return a;
            var found = FindFire(child);
            if (found != null) return found;
        }
        return null;
    }

    private void BuildLangs()
    {
        _langs.Clear();
        var spec = Environment.GetEnvironmentVariable("STS2_RENDER_LANGS");
        if (!string.IsNullOrWhiteSpace(spec))
        {
            foreach (var raw in spec.Split(new[] { ',', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line.StartsWith("#")) continue;
                var eq = line.IndexOf('=');
                var folder = eq >= 0 ? line[..eq].Trim() : line;
                var locale = eq >= 0 ? line[(eq + 1)..].Trim() : LocaleFor(folder);
                if (folder.Equals("eng", StringComparison.OrdinalIgnoreCase)) folder = "";
                _langs.Add((folder, locale));
            }
        }
        if (_langs.Count == 0) _langs.Add(("", "eng")); // default: English only
    }

    // Folder (site code) -> game locale. Identity except the Spanish swap: the
    // game labels them the reverse of the site (our esp = game spa, our spa = game esp).
    private static string LocaleFor(string folder) => folder.ToLowerInvariant() switch
    {
        "" or "eng" => "eng",
        "esp" => "spa",
        "spa" => "esp",
        _ => folder.ToLowerInvariant(),
    };

    private static void SetGameLocale(string locale)
    {
        try { LocManager.Instance.SetLanguage(locale); }
        catch (Exception e) { Log($"SetLanguage({locale}): " + e); }
    }

    private static void Log(string m) => MainFile.Logger.Info(m);
}
