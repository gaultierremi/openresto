import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/common/Button";
import { getWaitlistQuote } from "@/api/waitlist";

export function FullWaitlistNotice({
  restaurantId,
  seats,
  onJoin,
}: {
  restaurantId: number;
  seats: number;
  onJoin: () => void;
}) {
  const { t } = useTranslation();
  const [accepting, setAccepting] = useState(false);
  useEffect(() => {
    let active = true;
    setAccepting(false);
    getWaitlistQuote(restaurantId, seats).then((quote) => {
      if (active) setAccepting(quote?.acceptingGuests === true);
    });
    return () => {
      active = false;
    };
  }, [restaurantId, seats]);
  return accepting ? (
    <Button size="md" variant="secondary" onPress={onJoin} testID="full-join-waitlist">
      {t("booking.waitlist.joinCta")}
    </Button>
  ) : null;
}
