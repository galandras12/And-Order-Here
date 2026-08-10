/**
 * Repository reteg belepesi pont.
 *
 * A route-ok es socket handlerek innen kerjek el a repositorykat, es soha ne
 * nyuljanak kozvetlenul a JSON adathoz:
 *
 *   const { orderRepository } = require('../db/repositories');
 */
module.exports = {
  restaurantRepository: require('./restaurantRepository'),
  userRepository: require('./userRepository'),
  tableRepository: require('./tableRepository'),
  zoneRepository: require('./zoneRepository'),
  menuCategoryRepository: require('./menuCategoryRepository'),
  menuItemRepository: require('./menuItemRepository'),
  extraRepository: require('./extraRepository'),
  reservationRepository: require('./reservationRepository'),
  orderRepository: require('./orderRepository'),
  orderItemRepository: require('./orderItemRepository'),
  paymentRepository: require('./paymentRepository'),
  cashClosingRepository: require('./cashClosingRepository')
};
