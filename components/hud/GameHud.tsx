"use client";

import { Briefcase, Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { MissionBoard } from "@/components/missions/MissionBoard";
import { MissionTracker } from "@/components/missions/MissionTracker";
import { Minimap } from "@/components/missions/Minimap";
import { ResultsScreen } from "@/components/missions/ResultsScreen";
import { StationPanel } from "@/components/missions/StationPanel";
import { IncomingCall, PhoneButton, PhonePanel } from "@/components/phone/Phone";
import { ShopCounter } from "@/components/phone/ShopCounter";
import { ChatBar, SpeechBubbles } from "@/components/phone/Speech";
import { StoryDirector } from "@/components/story/StoryDirector";
import { Button, Chip } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import type { Game } from "@/game/core/Game";
import type { CityManifest } from "@/game/world/format";
import { formatTzs, useT } from "@/i18n";
import { usePlayer } from "@/stores/player";
import { useMissions } from "@/stores/missions";
import { AgeGate } from "./AgeGate";
import { RideHud, useTouchDevice } from "./RideHud";
import { Tutorial } from "./Tutorial";

/** Wallet in a few characters for narrow screens: 250k, 1.2M. */
const shortTzs = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : formatTzs(n));

/** Full in-game HUD: the ride overlay plus jobs, minimap, wallet and results. */
export function GameHud({ game, manifest, openBoardOnStart }: { game: Game; manifest: CityManifest; openBoardOnStart?: boolean }) {
  const t = useT();
  const wallet = usePlayer((s) => s.wallet);
  const hydrated = usePlayer((s) => s.hydrated);
  const tutorialDone = usePlayer((s) => s.tutorialDone);
  const active = useMissions((s) => s.active);
  const set = useMissions((s) => s.set);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const openBoard = () => {
    if (!useMissions.getState().offers.length) game.refreshOffers();
    set({ boardOpen: true, result: null });
  };

  // Arriving from the menu's "Jobs" tile: open the board once offers exist.
  useEffect(() => {
    if (!openBoardOnStart) return;
    const open = () => set({ boardOpen: true });
    if (useMissions.getState().offers.length) return open();
    return useMissions.subscribe((s, prev) => {
      if (s.offers.length && !prev.offers.length) open();
    });
  }, [openBoardOnStart, set]);

  const tutorial = hydrated && !tutorialDone;
  const touch = useTouchDevice();

  return (
    <RideHud
      game={game}
      manifest={manifest}
      quiet={tutorial}
      topCenter={<MissionTracker onAbandon={() => setConfirmAbandon(true)} />}
      topRight={
        <div className="flex items-center gap-2">
          <Chip icon={<Coins className="text-sun" />} className="tabular">
            <span className="sm:hidden">{shortTzs(wallet)}</span>
            <span className="max-sm:hidden">{formatTzs(wallet)}</span>
          </Chip>
          {!tutorial && <PhoneButton />}
        </div>
      }
      rail={
        <>
          <Minimap game={game} />
          {!active && !tutorial && (
            <Button variant="sun" icon={<Briefcase />} onClick={openBoard} className="animate-pulse-ring max-sm:px-3.5" aria-label={t.missions.open}>
              {t.missions.open}
            </Button>
          )}
        </>
      }
      topLeft={
        <>
          <IncomingCall game={game} />
          {touch && <ChatBar game={game} touch />}
        </>
      }
    >
      {tutorial && <Tutorial game={game} />}
      <StoryDirector enabled={hydrated && tutorialDone} />
      <div className="safe-x pointer-events-none absolute top-1/2 left-0 -translate-y-1/2">
        <StationPanel game={game} />
      </div>
      <SpeechBubbles />
      {!touch && <ChatBar game={game} touch={false} />}
      <ShopCounter game={game} />
      <AgeGate enabled={hydrated && tutorialDone} />
      <PhonePanel game={game} />
      <MissionBoard
        onAccept={(def) => game.acceptMission(def)}
        onRefresh={() => game.refreshOffers()}
      />
      <ResultsScreen
        onNext={() => {
          game.refreshOffers();
          set({ result: null, boardOpen: true });
        }}
      />
      <div className="pointer-events-auto">
        <Modal open={confirmAbandon} onClose={() => setConfirmAbandon(false)} title={t.missions.abandon} closeLabel={t.common.close}>
          <p className="text-cream/80">{t.missions.abandonConfirm}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="night" onClick={() => setConfirmAbandon(false)}>
              {t.common.back}
            </Button>
            <Button
              variant="coral"
              onClick={() => {
                game.missions?.abandon();
                setConfirmAbandon(false);
              }}
            >
              {t.missions.abandon}
            </Button>
          </div>
        </Modal>
      </div>
    </RideHud>
  );
}
