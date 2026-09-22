"""Unit tests for travel cost calculator."""

import pytest

from app.travel.calculator import (
    calculate_transport_cost,
    calculate_hotel_cost,
    calculate_homestay_cost,
    calculate_food_cost,
    estimate_trip_cost,
    TripParams,
    validate_params,
    get_available_modes,
    get_accom_tiers,
    get_food_tiers,
)


class TestTransportCalculator:
    def test_bus_ac_cost(self):
        cost = calculate_transport_cost("dhaka", "sylhet", "bus_ac", 1)
        assert cost > 0
        assert isinstance(cost, float)

    def test_bus_non_ac_cost(self):
        cost = calculate_transport_cost("dhaka", "sylhet", "bus_non_ac", 1)
        assert cost > 0
        # Non-AC should be cheaper than AC
        ac_cost = calculate_transport_cost("dhaka", "sylhet", "bus_ac", 1)
        assert cost < ac_cost

    def test_train_shovan_cost(self):
        cost = calculate_transport_cost("dhaka", "sylhet", "train_shovan", 1)
        assert cost > 0

    def test_train_ac_chair_cost(self):
        cost = calculate_transport_cost("dhaka", "sylhet", "train_ac_chair", 1)
        assert cost > 0

    def test_train_ac_berth_cost(self):
        cost = calculate_transport_cost("dhaka", "sylhet", "train_ac_berth", 1)
        assert cost > 0

    def test_flight_cost(self):
        cost = calculate_transport_cost("dhaka", "sylhet", "flight", 1)
        assert cost > 0
        # Flight should be more expensive than bus
        bus_cost = calculate_transport_cost("dhaka", "sylhet", "bus_ac", 1)
        assert cost > bus_cost

    def test_multiple_passengers(self):
        cost1 = calculate_transport_cost("dhaka", "sylhet", "bus_ac", 1)
        cost2 = calculate_transport_cost("dhaka", "sylhet", "bus_ac", 2)
        assert cost2 == cost1 * 2

    def test_invalid_mode(self):
        with pytest.raises(ValueError):
            calculate_transport_cost("dhaka", "sylhet", "invalid_mode", 1)

    def test_get_available_modes(self):
        modes = get_available_modes()
        assert "bus_ac" in modes
        assert "bus_non_ac" in modes
        assert "train_shovan" in modes
        assert "train_ac_chair" in modes
        assert "train_ac_berth" in modes
        assert "flight" in modes


class TestAccommodationCalculator:
    def test_hotel_cost_budget(self):
        cost = calculate_hotel_cost("sylhet", 3, "budget", 1, 11)
        assert cost > 0

    def test_hotel_cost_mid(self):
        cost = calculate_hotel_cost("sylhet", 3, "mid", 1, 11)
        assert cost > 0

    def test_hotel_cost_luxury(self):
        cost = calculate_hotel_cost("sylhet", 3, "luxury", 1, 11)
        assert cost > 0

    def test_hotel_cost_tier_order(self):
        budget = calculate_hotel_cost("sylhet", 3, "budget", 1, 11)
        mid = calculate_hotel_cost("sylhet", 3, "mid", 1, 11)
        luxury = calculate_hotel_cost("sylhet", 3, "luxury", 1, 11)
        assert budget < mid < luxury

    def test_hotel_cost_multiple_rooms(self):
        cost1 = calculate_hotel_cost("sylhet", 3, "mid", 1, 11)
        cost2 = calculate_hotel_cost("sylhet", 3, "mid", 2, 11)
        assert cost2 == cost1 * 2

    def test_hotel_cost_multiple_nights(self):
        cost1 = calculate_hotel_cost("sylhet", 1, "mid", 1, 11)
        cost3 = calculate_hotel_cost("sylhet", 3, "mid", 1, 11)
        assert cost3 == cost1 * 3

    def test_homestay_cost(self):
        cost = calculate_homestay_cost("sylhet", 3, "mid", 1, 11)
        assert cost > 0

    def test_seasonal_multiplier(self):
        # November (11) should have higher multiplier than January (1)
        cost_jan = calculate_hotel_cost("sylhet", 3, "mid", 1, 1)
        cost_nov = calculate_hotel_cost("sylhet", 3, "mid", 1, 11)
        assert cost_nov >= cost_jan

    def test_get_accom_tiers(self):
        tiers = get_accom_tiers()
        assert "budget" in tiers
        assert "mid" in tiers
        assert "luxury" in tiers


class TestFoodCalculator:
    def test_food_cost_budget(self):
        cost = calculate_food_cost(3, 2, "budget", 11)
        assert cost > 0

    def test_food_cost_mid(self):
        cost = calculate_food_cost(3, 2, "mid", 11)
        assert cost > 0

    def test_food_cost_luxury(self):
        cost = calculate_food_cost(3, 2, "luxury", 11)
        assert cost > 0

    def test_food_cost_tier_order(self):
        budget = calculate_food_cost(3, 2, "budget", 11)
        mid = calculate_food_cost(3, 2, "mid", 11)
        luxury = calculate_food_cost(3, 2, "luxury", 11)
        assert budget < mid < luxury

    def test_food_cost_multiple_people(self):
        cost1 = calculate_food_cost(3, 1, "mid", 11)
        cost2 = calculate_food_cost(3, 2, "mid", 11)
        assert cost2 == cost1 * 2

    def test_food_cost_multiple_days(self):
        cost1 = calculate_food_cost(1, 2, "mid", 11)
        cost3 = calculate_food_cost(3, 2, "mid", 11)
        assert cost3 == cost1 * 3

    def test_get_food_tiers(self):
        tiers = get_food_tiers()
        assert "budget" in tiers
        assert "mid" in tiers
        assert "luxury" in tiers


class TestTripCalculator:
    def test_estimate_trip_cost_basic(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=2,
            hotel_tier="mid",
            transport_mode="bus_ac",
            food_tier="mid",
            month=11,
        )
        breakdown = estimate_trip_cost(params)
        assert breakdown.transport > 0
        assert breakdown.accommodation > 0
        assert breakdown.food > 0
        assert breakdown.misc_buffer > 0
        assert breakdown.total > 0
        assert breakdown.currency == "BDT"

    def test_estimate_trip_cost_return_transport(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=2,
            hotel_tier="mid",
            transport_mode="bus_ac",
            food_tier="mid",
            month=11,
            return_transport=True,
        )
        params_no_return = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=2,
            hotel_tier="mid",
            transport_mode="bus_ac",
            food_tier="mid",
            month=11,
            return_transport=False,
        )
        breakdown_with = estimate_trip_cost(params)
        breakdown_without = estimate_trip_cost(params_no_return)
        assert breakdown_with.transport == breakdown_without.transport * 2

    def test_validate_params_valid(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=2,
            hotel_tier="mid",
            transport_mode="bus_ac",
            food_tier="mid",
            month=11,
        )
        errors = validate_params(params)
        assert len(errors) == 0

    def test_validate_params_invalid_days(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=0,
            people=2,
            hotel_tier="mid",
            transport_mode="bus_ac",
            food_tier="mid",
            month=11,
        )
        errors = validate_params(params)
        assert len(errors) > 0
        assert any("days" in e for e in errors)

    def test_validate_params_invalid_people(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=0,
            hotel_tier="mid",
            transport_mode="bus_ac",
            food_tier="mid",
            month=11,
        )
        errors = validate_params(params)
        assert len(errors) > 0
        assert any("people" in e for e in errors)

    def test_validate_params_invalid_month(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=2,
            hotel_tier="mid",
            transport_mode="bus_ac",
            food_tier="mid",
            month=13,
        )
        errors = validate_params(params)
        assert len(errors) > 0
        assert any("month" in e for e in errors)

    def test_validate_params_invalid_transport_mode(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=2,
            hotel_tier="mid",
            transport_mode="invalid_mode",
            food_tier="mid",
            month=11,
        )
        errors = validate_params(params)
        assert len(errors) > 0
        assert any("transport_mode" in e for e in errors)

    def test_validate_params_invalid_hotel_tier(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=2,
            hotel_tier="invalid_tier",
            transport_mode="bus_ac",
            food_tier="mid",
            month=11,
        )
        errors = validate_params(params)
        assert len(errors) > 0
        assert any("hotel_tier" in e for e in errors)

    def test_validate_params_invalid_food_tier(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=2,
            hotel_tier="mid",
            transport_mode="bus_ac",
            food_tier="invalid_tier",
            month=11,
        )
        errors = validate_params(params)
        assert len(errors) > 0
        assert any("food_tier" in e for e in errors)

    def test_estimate_trip_cost_with_flight(self):
        params = TripParams(
            origin="dhaka",
            destination="coxs_bazar",
            days=3,
            people=2,
            hotel_tier="luxury",
            transport_mode="flight",
            food_tier="luxury",
            month=12,
        )
        breakdown = estimate_trip_cost(params)
        assert breakdown.transport > 0
        assert breakdown.total > 0

    def test_trip_cost_details(self):
        params = TripParams(
            origin="dhaka",
            destination="sylhet",
            days=3,
            people=2,
            hotel_tier="mid",
            transport_mode="bus_ac",
            food_tier="mid",
            month=11,
        )
        breakdown = estimate_trip_cost(params)
        details = breakdown.details
        assert details["origin"] == "dhaka"
        assert details["destination"] == "sylhet"
        assert details["days"] == 3
        assert details["people"] == 2
        assert details["nights"] == 2  # days - 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])