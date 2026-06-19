using System;
using System.Linq;
using Godot;
using HarmonyLib;
using MegaCrit.Sts2.Core.Models;
using MegaCrit.Sts2.Core.Modding;

namespace RenderExporter;

// Mod entry point. The Slay the Spire 2 first-party loader calls Initialize() on
// load (the [ModInitializer] attribute), same as the companion mod. This mod is a
// dev tool: it only does anything when STS2_RENDER_OUT is set in the environment
// (the render container sets it), so it is inert during normal play.
//
// It loads alongside a content mod (e.g. the Watcher). Because the game renders
// every card in ModelDb.AllCards and the content mod registers its cards there,
// the exporter renders modded cards 1:1 with the engine, no special handling.
[ModInitializer(nameof(Initialize))]
public partial class MainFile : Node
{
    public const string ModId = "RenderExporter";

    public static MegaCrit.Sts2.Core.Logging.Logger Logger { get; } =
        new(ModId, MegaCrit.Sts2.Core.Logging.LogType.Generic);

    // Set once the export Node is attached, so the InitIds postfix only arms once
    // (InitIds can run more than once across a session).
    private static bool _armed;

    public static void Initialize()
    {
        var outDir = System.Environment.GetEnvironmentVariable("STS2_RENDER_OUT");
        if (string.IsNullOrWhiteSpace(outDir))
        {
            Logger.Info("STS2_RENDER_OUT not set; render exporter idle.");
            return;
        }
        Logger.Info($"render exporter armed -> {outDir}");
        var harmony = new Harmony(ModId);
        harmony.PatchAll();
    }

    // ModelDb.InitIds runs after all cards (base + every loaded mod's) are
    // registered, so ModelDb.AllCards is complete here. Attach the exporter then.
    [HarmonyPatch(typeof(ModelDb), "InitIds")]
    internal static class ModelDbInitIdsPatch
    {
        [HarmonyPostfix]
        private static void Postfix()
        {
            if (_armed) return;
            _armed = true;
            if (Engine.GetMainLoop() is not SceneTree tree) return;
            var node = new CardExporter { Name = "RenderExporter" };
            // Defer: adding children directly during InitIds is unsafe.
            tree.Root.CallDeferred(Node.MethodName.AddChild, node);
            Logger.Info($"attached exporter ({ModelDb.AllCards.Count()} cards in pool)");
        }
    }
}
