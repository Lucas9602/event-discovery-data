// app/__tests__/LocationInput.test.tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { LocationInput } from "../src/components/LocationInput";

describe("LocationInput", () => {
  it("calls onChange with the device position when geolocation is toggled on", async () => {
    const onChange = jest.fn();
    const getCurrentPosition = jest.fn().mockResolvedValue({ lat: 48.03, lon: 7.65 });

    await render(<LocationInput onChange={onChange} getCurrentPosition={getCurrentPosition} />);
    await fireEvent.press(screen.getByText("Standort verwenden"));

    await screen.findByText("Standort aktiv");
    expect(onChange).toHaveBeenCalledWith({ lat: 48.03, lon: 7.65 });
  });

  it("calls onChange with manually entered coordinates", async () => {
    const onChange = jest.fn();
    await render(<LocationInput onChange={onChange} getCurrentPosition={jest.fn()} />);

    await fireEvent.changeText(screen.getByPlaceholderText("Breitengrad"), "48.03");
    await fireEvent.changeText(screen.getByPlaceholderText("Längengrad"), "7.65");

    expect(onChange).toHaveBeenCalledWith({ lat: 48.03, lon: 7.65 });
  });
});
