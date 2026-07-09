// app/__tests__/FilterBar.test.tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { FilterBar } from "../src/components/FilterBar";

describe("FilterBar", () => {
  it("reports a default 25km radius once a location is set", async () => {
    const onChange = jest.fn();
    const getCurrentPosition = jest.fn().mockResolvedValue({ lat: 48.03, lon: 7.65 });

    await render(<FilterBar onChange={onChange} getCurrentPosition={getCurrentPosition} />);
    await fireEvent.press(screen.getByText("Standort verwenden"));
    await screen.findByText("Standort aktiv");

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ origin: { lat: 48.03, lon: 7.65 }, radiusMeters: 25000 }),
    );
  });

  it("reports dateFrom/dateTo as start/end-of-day ISO strings once entered", async () => {
    const onChange = jest.fn();

    await render(<FilterBar onChange={onChange} getCurrentPosition={jest.fn()} />);
    await fireEvent.changeText(screen.getByPlaceholderText("Von (JJJJ-MM-TT)"), "2026-08-10");
    await fireEvent.changeText(screen.getByPlaceholderText("Bis (JJJJ-MM-TT)"), "2026-08-20");

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dateFrom: "2026-08-10T00:00:00.000Z",
        dateTo: "2026-08-20T23:59:59.999Z",
      }),
    );
  });
});
