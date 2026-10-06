"use client";

import { Briefcase, Coins } from "lucide-react";
import { useState } from "react";
import { MissionBoard } from "@/components/missions/MissionBoard";
import { MissionTracker } from "@/components/missions/MissionTracker";
import { Minimap } from "@/components/missions/Minimap";
import { ResultsScreen } from "@/components/missions/ResultsScreen";
import { StationPanel } from "@/components/missions/StationPanel";
import { Button, Chip, Modal } from "@/components/ui";
import type { Game } from "@/game/core/Game";
import type { CityManifest } from "@/game/world/format";
import { formatTzs, useT } from "@/i18n";
import { usePlayer } from "@/stores/player";
import { useMissions } from "@/stores/missions";
import { RideHud } from "./RideHud";

/** Full in-game HUD: the ride overlay plus jobs, minimap, wallet and results. */
export function GameHud({ game, manifest }: { game: Game; manifest: CityManifest }) {
  const t = useT();
  const wallet = usePlayer((s) => s.wallet);
  const active = useMissions((s) => s.active);
  const set = useMissions((s) => s.set);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const openBoard = () => {
    if (!useMissions.getState().offers.length) game.refreshOffers();
    set({ boardOpen: true, result: null });
  };

  return (
    <RideHud
      game={game}
      manifest={manifest}
      topCenter={<MissionTracker onAbandon={() => setConfirmAbandon(true)} />}
      topRight={
        <div className="flex flex-col items-end gap-2">
          <Chip icon={<Coins className="text-sun" />} className="tabular">
            {formatTzs(wallet)}
          </Chip>
          <Minimap game={game} />
          {!active && (
            <Button variant="sun" icon={<Briefcase />} onClick={openBoard} className="animate-pulse-ring">
              {t.missions.open}
            </Button>
          )}
        </div>
      }
    >
      <div className="safe-x pointer-events-none absolute top-1/2 left-0 -translate-y-1/2">
        <StationPanel game={game} />
      </div>
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
